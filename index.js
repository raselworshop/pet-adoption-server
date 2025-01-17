const express = require('express')
const cors = require('cors')
require('dotenv').config();
const morgan = require('morgan')
const { MongoClient, ServerApiVersion } = require('mongodb');

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