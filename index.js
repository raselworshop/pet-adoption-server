const express = require('express')
const cors = require('cors')
require('dotenv').config();
const morgan = require('morgan')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express()
const port = process.env.PORT || 5000;

// middle ware 
app.use(morgan('tiny'))
app.use(cors())
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.5hy3n.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`; //ok

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
      const query = { email: user.email }
      const isExist = await usersCollection.findOne(query)
      if (isExist) {
        return res.send({ message: "user already exist!", insertedId: null })
      }
      const result = await usersCollection.insertOne(user)
      res.send(result)
    })

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

    // adoption data to db 
    app.post('/adopted', async (req, res) => {
      const adoptionData = req.body;
      const result = await adoptsCollection.insertOne(adoptionData)
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

    // get a specific donated details
    app.get('/donation-campaigns/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const result = await donationsCollection.findOne(filter)
      res.status(200).send(result) 
    })

    // make a donation
    app.post('/donation-campaigns/donate', async (req, res) => {
      const { campId, amount, donor } = req.body;
      if (!campId || !amount || !donor) {
        return res.status(400).send({ message: "Required Field Missing!" })
      }
      try {
        const campFilter = { _id: new ObjectId(campId) }
        const result = await donationsCollection.findOne(campFilter)
        if (!result) {
          return res.status(400).send({ message: "Campaign not found" })
        }
        const updateDon = await donationsCollection.updateOne(
          campFilter,
          {
            $inc: { donatedAmount: amount },
            $push: {
              donors: { name: donor.name, email: donor.email, amount }
            }
          }
        )
        if (updateDon.modifiedCount === 0) {
          return res.status(500).send({ message: "Failed to update donation!" })
        }
        res.status(200).send({ message: "Donation successfull!" })
      } catch (error) {
        console.error("Error processing donation:", error);
        res.status(500).send({ message: "An error occurred during donation processing." });
      }
    })

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