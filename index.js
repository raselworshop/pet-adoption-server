const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();
const stripe = require('stripe')(process.env.PAYMENT_GATEWAY_SECRET_KEY)
const morgan = require('morgan')

const app = express()
const port = process.env.PORT || 5000;

// middle ware 
app.use(morgan('tiny'))
app.use(cors({
  origin: [
    "http://localhost:5173",
    'https://pet-adoption-f983a.web.app',
    "https://pet-adoption-f983a.firebaseapp.com",
    "https://shiny-capybara-e3bc6b.netlify.app",
    "https://violet-egg.surge.sh"
  ],
  credentials:true
}))
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
    // await client.connect();

    const db = client.db('pet_adoption')
    const usersCollection = db.collection('users')
    const petsCollection = db.collection('pets')
    const adoptsCollection = db.collection('adopts')
    const donationsCollection = db.collection('donations')

    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '5h' })
      res.send({ token })
    })

    const verifyToken = (req, res, next) => {
      // console.log('inside verify token', req.headers)
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'Unauthorized access' })
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
        if (error) {
          return res.status(401).send({ message: "Unauthorized access" })
        }
        req.decoded = decoded;
        next()
      })
    }

    // use verifyAdmin after token verified
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email}
      const user = await usersCollection.findOne(query)
      const isAdmin = user?.role === 'admin'
      if(!isAdmin){
        return res.status(403).send({message:"Forbidden access"})
      }
      next()
    }

    const checkBan = async (req, res, next) => {
      const user = await usersCollection.findOne({ email: req.body.email });
      if (user?.isBanned) {
        return res.status(403).json({ message: 'Your account has been banned.' });
      }
      next();
    };
    exports = checkBan;
    // Routes accessible by admins only
    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden access" })
      }
      const query = { email: email }
      const user = await usersCollection.findOne(query)
      let admin = false;
      if (user) {
        admin = user?.role === 'admin'
      }
      res.send({ admin });
    });

    // analytics admin 
    app.get('/admin-analytics', verifyToken, verifyAdmin, async (req, res) => {
      const users = await usersCollection.estimatedDocumentCount()
      const pets = await petsCollection.estimatedDocumentCount()
      const adopts = await adoptsCollection.estimatedDocumentCount()
      const donationCount = await donationsCollection.aggregate([
        { $unwind: "$donors" },
        {$group: {_id:null, totalAmount:{$sum:{$toDouble: "$donors.amount"}}}}
      ]).toArray()
      const donations = donationCount.length>0 ? donationCount[0].totalAmount:0;

      res.send({
        users,
        pets,
        adopts,
        donations
      })
    })

    app.get('/donations-by-category', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const donationsSummary = await donationsCollection.aggregate([
          { $unwind: "$donors" },
          {
            $group: {
              _id: "$donors.category",
              donatedAmount: { $sum: { $toDouble: "$donors.amount" } },
              donorCount: { $sum: 1 }
            }
          },
          {
            $project: {
              _id: 0,
              category: "$_id",
              donatedAmount: 1,
              donorCount: 1
            }
          }
        ]).toArray();
    
        res.send(donationsSummary);
      } catch (error) {
        // console.error('Error fetching donations by category:', error);
        res.status(500).send('Server error');
      }
    });
    
    
    app.patch('/users/make-admin/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: 'Invalid user ID' });
      }

      try {
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role: 'admin' } }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).send({ message: 'User not found.' });
        }

        res.status(200).send({ message: 'User promoted to admin successfully.' });
      } catch (error) {
        // console.error('Failed to update user role:', error);
        res.status(500).send({ message: 'Failed to update user role.' });
      }
    });

    app.patch('/users/ban/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      try {
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { banned: true } }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).send({ message: 'User not found.' });
        }

        res.status(200).send({ message: 'User banned successfully.' });
      } catch (error) {
        // console.error('Failed to ban user:', error);
        res.status(500).send({ message: 'Failed to ban user.' });
      }
    });
    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const result = await usersCollection.find().toArray();
        res.send(result);
      } catch (err) {
        // console.error(err); res.status(500).send("An error occurred while fetching users.");
      }
    })
    app.patch('/pets/status/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const { isAdopted } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ error: 'Invalid pet ID' });
      }

      const filter = { _id: new ObjectId(id) };
      const updateDoc = { $set: { isAdopted } };

      try {
        const result = await petsCollection.updateOne(filter, updateDoc);

        if (result.modifiedCount === 0) {
          return res.status(404).send({ error: 'Pet not found or no changes made' });
        }

        res.status(200).send({ message: 'Pet status updated successfully', result });
      } catch (error) {
        // console.error('Error updating pet status:', error);
        res.status(500).send({ error: 'Failed to update pet status. Please try again later.' });
      }
    });


    // user collectin 
    app.post('/users', async (req, res) => {
      const user = req.body;
      // console.log('Received Data:', req.body)
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
        // console.error("Error updating email:", error);
        res.status(500).send({ message: "Failed to update email!" });
      }
    });


    // all pets 
    app.get('/pets', async (req, res) => {
      const { search, category, page = 1, limit = 10 } = req.query;
      const filter = { isAdopted: false }
      if (search) {
        filter.petName = new RegExp(search, 'i')
      }
      if (category) {
        filter.petCategory = new RegExp(`^${category}$`, 'i')
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
    app.get('/pets/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await petsCollection.findOne(query)
      res.send(result)
    })

    // get pets by user email 
    app.get('/my-pets/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { ownerMail: email }
      const result = await petsCollection.find(query).toArray()
      res.send(result)
    })

    // update a pet by id
    app.put('/my-pets/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ error: 'Invalid pet ID' });
      }

      if (!updatedData || Object.keys(updatedData).length === 0) {
        return res.status(400).send({ error: 'No data provided for update' });
      }

      const filter = { _id: new ObjectId(id) };
      const updateDoc = { $set: updatedData };

      try {
        const result = await petsCollection.updateOne(filter, updateDoc);

        if (result.modifiedCount === 0) {
          return res.status(404).send({ error: 'Pet not found or no changes made' });
        }

        res.status(200).send({ message: 'Pet updated successfully', result });
      } catch (error) {
        // console.error('Error updating pet:', error);
        res.status(500).send({ error: 'Failed to update pet. Please try again later.' });
      }
    });

    // delete a pet by id
    app.delete('/my-pets/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const result = await petsCollection.deleteOne(filter)
      res.send(result)
    })

    //status updating
    app.patch('/my-pets/status/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const update = { $set: { isAdopted: true } }
      const result = await petsCollection.updateOne(query, update)
      if (result.matchedCount === 0) {
        return res.status(404).send({ message: "Pet not fund" })
      }
      res.status(200).send(result)
    })

    // request for adoption 
    app.post('/request-adoption', async (req, res) => {
      const adoptionData = req.body;
      // console.log(adoptionData)
      const { petId, adopterName, adopterMail, adopterPhone, adopterAddress } = adoptionData;
      if (!petId || !adopterName || !adopterMail || !adopterPhone || !adopterAddress) {
        return res.status(400).send({ message: 'All fields are required.' });
      }

      try {
        // check pet is available and isn't adopted 
        const pet = await petsCollection.findOne({
          _id: new ObjectId(petId),
          isAdopted: false,
        })
        if (!pet) {
          return res.status(404).send({ message: "Pet not found or already adopted" })
        }

        // Check if the same email holder has already requested adoption for this pet
        const existingRequest = await adoptsCollection.findOne({
          petId: new ObjectId(petId),
          adopterMail: adopterMail,
          status: 'Pending'
        });

        if (existingRequest) {
          // console.log(`User ${adopterMail} already has a pending request for pet ${pet.petName}`);

          return res.status(400).send({ message: 'You have already requested to adopt this pet.' });
        }

        //caret adoption request to db
        const adoptionRequ = {
          petId,
          petName: pet.petName,
          petImage: pet.petImage,
          adopterName,
          adopterMail,
          adopterPhone,
          adopterAddress,
          status: 'Pending',
          requDate: new Date()
        };
        const result = await adoptsCollection.insertOne(adoptionRequ)
        res.status(201).send({ message: 'Adoption request succussfull', result })
      } catch (error) {
        // console.error('Error processing adoption request:', error);
        res.status(500).send({ message: 'Failed to process adoption request.', error });
      }
    })

    // requested adoption status changer
    app.patch('/adopted/status/:id', verifyToken, async (req, res) => {
      const { status } = req.body;
      const id = req.params.id;
      if (!status || !['Accepted', 'Rejected',].includes(status)) {
        return res.status(400).send({ message: 'Invalid status value' })
      }

      // update status here 
      const query = { _id: new ObjectId(id) }
      const update = { $set: { status } }
      try {
        const result = await adoptsCollection.updateOne(query, update)
        if (result.modifiedCount === 0) {
          return res.status(404).send({ message: "Adoption request not fount!" })
        }
        if (status === 'Accepted') {
          const petUpdate = { $set: { isAdopted: true } }
          await petsCollection.updateOne({ _id: new ObjectId(id) }, petUpdate)
        }
        res.status(200).send({ message: `Adoption request ${status.toLowerCase()} successfully` })
      } catch (error) {
        // console.error('Error updating adoption status:', error);
        res.status(500).send({ message: 'Failed to update adoption status.' });
      }
    })

    // from user to owner request 
    app.get('/adoptRequests/byOwnerMail/:posterEmail', verifyToken, async (req, res) => {
      const { posterEmail } = req.params;
      // console.log('Full query object:', req.params);
      // console.log('posterEmail: ', posterEmail);

      if (!posterEmail) {
        return res.status(400).send({ message: 'Poster email is required.' });
      }

      try {
        const query = { ownerMail: posterEmail };
        const postedPets = await petsCollection.find(query).toArray();

        if (postedPets.length === 0) {
          return res.status(404).send({ message: 'No pets found posted by this user.' });
        }

        const petIds = postedPets.map(pet => pet._id.toString());
        // console.log('petIds: ', petIds);

        const requests = await adoptsCollection.find({ petId: { $in: petIds } }).toArray();
        // console.log('requests: ', requests);

        if (requests.length === 0) {
          return res.status(404).send({ message: 'No adoption requests found for pets posted by this user.' });
        }

        res.status(200).send(requests);
      } catch (error) {
        // console.error('Failed to fetch adoption requests:', error);
        res.status(500).send({ message: 'Failed to fetch adoption requests.', error });
      }
    });

    // user requested pets list 
    app.get('/adopted/requests/:userEmail', verifyToken, async (req, res) => {
      const email = req.params.userEmail;
      // console.log('Full query object:', req.params);
      // console.log('email:', email);

      if (!email) {
        return res.status(400).send({ message: 'Email is required' });
      }

      try {
        const query = { adopterMail: email };
        const requests = await adoptsCollection.find(query).toArray();

        if (requests.length === 0) {
          return res.status(404).send({ message: 'No adoption requests found for this pet by the provided email.' });
        }

        res.status(200).send(requests);
      } catch (error) {
        // console.error('Failed to fetch adoption requests:', error);
        res.status(500).send({ message: 'Failed to fetch adoption requests.', error });
      }
    });

    // Cancel adoption request route
    app.patch('/cencell/status/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;

      // console.log('Updating request with id:', id, 'to status:', status);
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: `Invalid request ID ${id}.` });
      }

      try {
        const result = await adoptsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).send({ message: 'Request not found or already updated.' });
        }

        res.status(200).send({ message: 'Request status updated successfully.' });
      } catch (error) {
        // console.error('Failed to update request status:', error);
        res.status(500).send({ message: 'Failed to update request status.', error });
      }
    });

    //adopted return to client user based
    app.get('/adopted', async (req, res) => {
      const email = req.query.email;
      const query = { adopterMail: email }
      const result = await adoptsCollection.find(query).toArray()
      res.send(result)
    })

    // donation campaign page
    // admin routes
    // Show all donation campaigns (protected route)
    app.get('/admin/donation-campaigns', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const campaigns = await donationsCollection.find().toArray();
        res.json(campaigns);
      } catch (error) {
        res.status(500).json({ message: 'Failed to fetch campaigns' });
      }
    });

    // Delete a donation campaign (protected route)
    app.delete('/admin/donation-campaigns/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ error: 'Invalid donation campaign ID' });
      }
      try {
        await donationsCollection.deleteOne({ _id: new ObjectId(id) });
        res.status(204).send();
      } catch (error) {
        res.status(500).send({ message: 'Failed to delete campaign' });
      }
    });

    // Edit a donation campaign (protected route)
    app.put('/admin/donation-campaigns/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ error: 'Invalid donation campaign ID' });
      }
      if (!updatedData || Object.keys(updatedData).length === 0) {
        return res.status(400).send({ error: 'No data provided for update' });
      }
      try {
        const result = await donationsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData }
        );
        if (result.modifiedCount === 0) {
          return res.status(404).send({ error: 'Campaign not found or no changes made' });
        }
        res.status(200).send(result);
      } catch (error) {
        res.status(500).send({ error: 'Failed to update campaign' });
      }
    });

    // Pause/Unpause a donation campaign (protected route)
    app.patch('/admin/donation-campaigns/:id/pause', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const { isPaused } = req.body;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ error: 'Invalid donation campaign ID' });
      }
      try {
        const result = await donationsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { isPaused } }
        );
        if (result.matchedCount === 0) {
          return res.status(404).send({ error: 'Campaign not found' });
        }
        res.status(200).send(result);
      } catch (error) {
        res.status(500).send({ message: 'Failed to update campaign status', error });
      }
    });

    // user routes 
    // post a campaign 
    app.post('/donation-campaigns', async (req, res) => {
      const campaignData = req.body;
      if (!campaignData) return res.status(400).send({ message: "Campaign data not recieved" })
      try {
        const result = await donationsCollection.insertOne(campaignData)
        res.status(201).send(result)
      } catch (error) {
        // console.log('Error creating campaign', error)
        res.status(500).send({ message: 'Failed to create campaign' })
      }
    })

    // get all campaings
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

    // update donation using id 
    app.put('/donation-campaigns/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ error: 'Invalid donation campaign ID' });
      }

      if (!updatedData || Object.keys(updatedData).length === 0) {
        return res.status(400).send({ error: 'No data provided for update' });
      }

      const filter = { _id: new ObjectId(id) };
      const updateDoc = { $set: updatedData };

      try {
        const result = await donationsCollection.updateOne(filter, updateDoc);

        if (result.modifiedCount === 0) {
          return res.status(404).send({ error: 'Campaign not found or no changes made' });
        }

        res.status(200).send(result);
      } catch (error) {
        // console.error('Error updating camp:', error);
        res.status(500).send({ error: 'Failed to update camp. Please try again later.' });
      }
    });

    //get campaign by user email
    app.get('/my-donation-campaigns/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { ownerMail: email }
      if (!query) {
        return res.status(404).send({ message: "You don't added any campaigns, Please add one" })
      }
      try {
        const result = await donationsCollection.find(query).toArray()
        res.send(result)
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch data" })
      }
    })

    //pause/unpause campaign
    app.patch('/donation-campaign/pause/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const { isPaused } = req.body;
      const filter = { _id: new ObjectId(id) }
      const updateDoc = { $set: { isPaused } }
      try {
        const result = await donationsCollection.updateOne(filter, updateDoc)
        if (result.matchedCount === 0) {
          return res.status(404).send({ message: "Donation campaign not found" })
        }
        res.status(200).send(result)
      } catch (error) {
        // console.log('eror from status route')
        res.status(500).send({ message: "Error updating campaign", error })
      }
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
        // console.error("Error creating payment intent:", error);
        res.status(500).send({ message: "Failed to create payment intent!" });
      }
    })

    // update donation 
    app.post("/update-donation", async (req, res) => {
      const { campaignId, amount, donorName, donorEmail, userEmail, transactionId, petCategory } = req.body;

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
                petCategory,
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
        // console.error("Error updating onation:", error);
        res.status(500).send({ message: "An error occurred during donation update." });
      }
    });

    //get user donation
    app.get('/donors/campaigns', verifyToken, async (req, res) => {
      const { email } = req.query;
      // console.log("Email from donation query", email)

      if (!email) {
        return res.status(400).send({ message: "Email is required" })
      }
      try {
        const result = await donationsCollection.aggregate([
          {
            $match: { donors: { $elemMatch: { email } } }
          },
          {
            $project: {
              _id: 1,
              petName: 1,
              petImage: 1,
              amount: {
                $arrayElemAt: [{
                  $map: {
                    input: {
                      $filter: {
                        input: '$donors',
                        as: 'donor',
                        cond: { $eq: ['$$donor.email', email] }
                      }
                    },
                    as: 'donor',
                    in: '$$donor.amount'
                  }
                }, 0]
              }
    
            }
          }
        ]).toArray();

        res.send(result)
      } catch (error) {
        // console.log(error)
        res.status(500).send({ message: " Error fetching donation", error })
      }
    })

    // make a refund
    app.post('/donors/refund', verifyToken, async (req, res) => {
      const { id, email } = req.body;
      if (!id || !email) {
        return res.status(400).send({ message: "CAmpId and email are required!" })
      }
      const query = { _id: new ObjectId(id), 'donors.email': email }
      try {
        // retrieve specific donor's amount 
        const camp = await donationsCollection.findOne(query, { projection: { 'donors.$': 1 } })
        if (!camp || !camp.donors.length) {
          return res.status(404).send({ message: "Donation not fund" })
        }
        const { amount } = camp.donors[0]

        // delete the donor
        const updateDoc = { $pull: { donors: { email } } }
        const result = await donationsCollection.updateOne(query, updateDoc)
        if (result.modifiedCount === 0) {
          return res.status(400).send({ message: "Failed to proccess refund" })
        }
        res.send({ message: "Refund processed successfully", amount })
      } catch (error) {
        // console.log("Thw issue is from refund rout", error)
        res.status(500).send({ message: "error proccessing refund" })
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