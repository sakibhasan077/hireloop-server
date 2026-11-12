import express from "express";
import cors from "cors";
import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";

const app = express();
const port = process.env.port || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Mongodb setup
const client = new MongoClient(process.env.MONGODB_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

const connected = await connectToMongoDB();
const db = connected.db("hire-loop")
const jobsCollection = db.collection("jobs");

app.get("/", (req, res) => {
  res.send({ message: "Hire Loop API is running", status: "success" });
});

// job related apis
//Add
app.get("/jobs",async(req,res)=>{
  const result = await jobsCollection.find({}).toArray()
  res.send(result);
})
// get specific job data 
app.get("/jobs/:id",async(req,res)=>{
  const {id} = req.params
  const result = await jobsCollection.findOne({_id: new ObjectId(id)});
  res.send(result)
})
// post
app.post("/jobs",async(req,res)=>{
  const job = req.body;
  const result = await jobsCollection.insertOne(job)
  res.send(result);
})

// update 
app.patch("/jobs/:id",async(req,res)=>{
  const {id} = req.params;
  // Strip _id: MongoDB can't $set an immutable field, which caused a 500.
  const {_id, ...data} = req.body;
  const result = await jobsCollection.updateOne(
    {_id: new ObjectId(id)},
    {
      $set: data
    }

  );
  res.send(result)
})

//delete
app.delete("/jobs/:id",async(req,res)=>{
  const {id} = req.params;
  const result = await jobsCollection.deleteOne({_id: new ObjectId(id)});
  res.send(result)
})

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
