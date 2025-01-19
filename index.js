const express = require('express')
const cors = require('cors')
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();
const stripe = require('stripe')(process.env.PAYMENT_GATEWAY_SECRET_KEY)
const morgan = require('morgan')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express()
const port = process.env.PORT || 5000;

// middle ware 
app.use(morgan('tiny'))
app.use(cors())
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.5hy3n.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`; //ok

console.log('stripe secret key::', process.env.PAYMENT_GATEWAY_SECRET_KEY)
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db('pet_adoption')
    const usersCollection = db.collection('users')
    const petsCollection = db.collection('pets')
    const adoptsCollection = db.collection('adopts')
    const donationsCollection = db.collection('donations')

    // user collectin 
    app.post('/users', async (req, res) => {
      const user = req.body;
      console.log('Received Data:', req.body)
      const query = user.email ? { email: user.email } : { facebookId: user.facebookId };

      const isExist = await usersCollection.findOne(query)
      if (isExist) {
        return res.send({ message: "user already exist!", email: user.email, insertedId: null })
      }
      if (!user.email && !user.facebookId) {
        user.email = `guest_${uuidv4()}@anonymous.com`
      }

      const result = await usersCollection.insertOne(user)
      res.send(result)
    })

    // dami email udate option need to utilise on pudation
    app.put('/users/:id', async (req, res) => {
      const id = req.params.id;
      const { email } = req.body;

      if (!email) {
        return res.status(400).send({ message: "Email is required for update!" });
      }

      try {
        const filter = { facebookId: id };
        const update = { $set: { email: email } };
        const result = await usersCollection.updateOne(filter, update);

        if (result.modifiedCount === 0) {
          return res.status(404).send({ message: "User not found or already updated!" });
        }

        res.send({ message: "Email updated successfully!" });
      } catch (error) {
        console.error("Error updating email:", error);
        res.status(500).send({ message: "Failed to update email!" });
      }
    });


    // all pets 
    app.get('/pets', async (req, res) => {
      const { search, category, page = 1, limit = 3 } = req.query;
      const filter = { isAdopted: false }
      if (search) {
        filter.petName = new RegExp(search, 'i')
      }
      if (category) {
        filter.petCategory = category
      }
      try {
        const result = await petsCollection.find(filter).sort({ dateAdded: -1 }).skip((page - 1) * limit).limit(Number(limit)).toArray();
        res.send(result);
      } catch (err) {
        console.error(err); res.status(500).send("An error occurred while fetching pets.");

      }
    })

    // post a pet 
    app.post('/pets', async (req, res) => {
      const petData = req.body;
      const result = await petsCollection.insertOne(petData)
      res.status(200).send({ result, message: "Successfully added" })
    })
    //get a pet by id for details data
    app.get('/pets/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await petsCollection.findOne(query)
      res.send(result)
    })

    // get pets by user email 
    app.get('/my-pets/:email', async (req, res) => {
      const email = req.params.email;
      const query = {ownerMail: email}
      const result = await petsCollection.find(query).toArray()
      res.send(result)
    })

    // update a pet by id 
    app.put('/my-pets/:id', async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;
      const filter = {_id: new ObjectId(id)}
      const updateDoc= {$set: updatedData}
      const result = await petsCollection.updateOne(filter, updateDoc)
      res.send(result)
    })

    // adoption data to db 
    app.post('/adopted', async (req, res) => {
      const adoptionData = req.body;
      const result = await adoptsCollection.insertOne(adoptionData)
      res.send(result)
    })

    //adopted return to client user based
    app.get('/adopted', async (req, res) => {
      const email = req.query.email;
      const query = { adopterMail: email }
      const result = await adoptsCollection.find(query).toArray()
      res.send(result)
    })

    // donation campaign page 
    app.get('/donation-campaigns', async (req, res) => {
      const { page = 1, limit = 3 } = req.query;
      const skip = (page - 1) * limit
      try {
        const result = await donationsCollection.find({}).sort({ date: -1 }).skip(skip).limit(parseInt(limit)).toArray();
        const totalCamp = await donationsCollection.estimatedDocumentCount();
        res.status(200).send({
          result,
          hasMore: skip + result.length < totalCamp
        })
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch campaigns data" })
      }
    })

    //randomly show donating 3card
    app.get('/donation-campaigns/random', async (req, res) => {
      const { limit = 3 } = req.query;
      try {
        const totalCount = await donationsCollection.countDocuments()
        const randomSkip = Math.floor(Math.random() * totalCount)
        const result = await donationsCollection.find({}).skip(randomSkip).limit(Number(limit)).toArray();
        res.status(200).send(result)
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch random campaigns" });
      }
    })

    // get a specific donated details
    app.get('/donation-campaigns/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const result = await donationsCollection.findOne(filter)
      res.status(200).send(result)
    })

    // make a donation
    app.post("/create-payment-intent", async (req, res) => {
      const { amount } = req.body;
      if (!amount) {
        return res.status(400).send({ message: "Required Field Missing!" })
      }
      try {
        // carete payment intent 
        const paymentIntent = await stripe.paymentIntents.create({
          amount: parseInt(amount) * 100,
          currency: "usd",
          payment_method_types: ["card"]
        })

        res.status(200).send({
          clientSecret: paymentIntent.client_secret,
          message: "client secret created successfully!"
        })
      } catch (error) {
        console.error("Error creating payment intent:", error);
        res.status(500).send({ message: "Failed to create payment intent!" });
      }
    })

    // update donation 
    app.post("/update-donation", async (req, res) => {
      const { campaignId, amount, donorName, donorEmail, userEmail, transactionId } = req.body;

      if (!campaignId || !amount || !donorName || !donorEmail || !transactionId) {
        return res.status(400).send({ message: "Required field missing!" });
      }

      try {
        const campFilter = { _id: new ObjectId(campaignId) };

        const updateDonate = await donationsCollection.updateOne(
          campFilter,
          {
            $inc: { donatedAmount: parseInt(amount) },
            $push: {
              donors: {
                name: donorName,
                email: donorEmail,
                donor: userEmail,
                amount,
                transactionId,
                date: new Date()
              },
            },
          }
        );

        if (updateDonate.modifiedCount === 0) {
          return res.status(500).send({ message: "Failed to update donation!" });
        }

        res.status(200).send({ message: "Donation updated successfully!" });
      } catch (error) {
        console.error("Error updating donation:", error);
        res.status(500).send({ message: "An error occurred during donation update." });
      }
    });


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', async (req, res) => {
  res.send('Your Favorite Pet Adoption Server is running on')
})

app.listen(port, () => {
  console.log(`Pet adoption server is running on:${port}`)
})