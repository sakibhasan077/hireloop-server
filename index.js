import express from "express";
import cors from "cors";
import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";
import Stripe from "stripe";

const app = express();
const port = process.env.port || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Stripe setup
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
const db = connected.db("hire-loop");
const jobsCollection = db.collection("jobs");
const applicationsCollection = db.collection("applications");
const paymentCollection = db.collection("payment");
const userCollection = db.collection("user")
const sessions = db.collection("session")

app.get("/", (req, res) => {
  res.send({ message: "Hire Loop API is running", status: "success" });
});

// verify Token 
const verifyToken = async (req,res,next) =>{
  const authHeader = req.headers.authorization;
  if(!authHeader) {
    res.status(401).send({message: "Unauthorized access"});
    return;
  }
  const token = authHeader.split(" ")[1]
  if(!token) {
    res.status(401).send({message: "Unauthorized access"});
    return;
  }
  const session = await sessions.findOne({token});
  if(!session) {
    res.status(401).send({message: "Unauthorized access"});
    return;
  }
  
  const user = await userCollection.findOne({_id: new ObjectId(session.userId)})
  if(!user) {
    res.status(401).send({message: "Unauthorized access"});
    return;
  }

  req.user = user;
  next()
  

}

// user related apis
app.get("/users/:id", async (req, res) =>{
  const {id} = req.params;
  const result = await userCollection.findOne({_id: new ObjectId(id)}, {projection:{premium:1}});
  res.send(result)
})

app.patch("/users/:id/role",async (req,res)=>{
  const {id} = req.params;
  const result = await userCollection.updateOne(
    {_id: new ObjectId(id)},
    {
      $set: {
        role: req.body.role
      }
    }
  )
  res.send(result);
})

// job related apis
//Add
app.get("/jobs", async (req, res) => {
  const searchQuery = {};
  if (req.query) {
    if (req.query.jobType) {
      searchQuery.jobType = req.query.jobType;
    }
    if (req.query.remote) {
      searchQuery.remote = req.query.remote === "true" ? true : false;
    }
    if (req.query.jobCategory) {
      searchQuery.jobCategory = req.query.jobCategory;
    }
    if(req.query.recruiterId){
      searchQuery.recruiterId = req.query.recruiterId;
    }
    if (req.query.search) {
      searchQuery.$or = [
        { jobTitle: { $regex: req.query.search, $options: "i" } },
        { responsibilities: { $regex: req.query.search, $options: "i" } },
        { qualifications: { $regex: req.query.search, $options: "i" } },
      ];
    }
  }
  const result = await jobsCollection.find(searchQuery).toArray();
  res.send(result);
});
// get specific job data
app.get("/jobs/:id", async (req, res) => {
  const { id } = req.params;
  const result = await jobsCollection.findOne({ _id: new ObjectId(id) });
  res.send(result);
});
// post
app.post("/jobs", async (req, res) => {
  const job = req.body;
  const result = await jobsCollection.insertOne(job);
  res.send(result);
});

// update
app.patch("/jobs/:id", async (req, res) => {
  const { id } = req.params;
  // Strip _id: MongoDB can't $set an immutable field, which caused a 500.
  const { _id, ...data } = req.body;
  const result = await jobsCollection.updateOne(
    { _id: new ObjectId(id) },
    {
      $set: data,
    },
  );
  res.send(result);
});

//delete
app.delete("/jobs/:id", async (req, res) => {
  const { id } = req.params;
  const result = await jobsCollection.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
});

// Application Related API
//get
app.get("/applications", verifyToken , async (req, res) => {
  const query = {};
  const { userId,jobId } = req.query;
  if (userId) {
    query.userId = userId;
  }
  if(jobId){
    const job = await jobsCollection.findOne({_id: new ObjectId(jobId)});
    if(job.recruiterId !== req.user._id.toString() && req.user.role !== "admin"){
      res.status(403).send({message: "Forbidden access"});
      return;
    }
    query.jobId = jobId;
  }
  const result = await applicationsCollection.find(query).toArray();
  res.send(result);
});
// Count
app.get("/applications/count", async (req, res) => {
  const query = {};
  const { userId } = req.query;
  if (userId) {
    query.userId = userId;
  }
  const result = await applicationsCollection.countDocuments(query);
  res.send({ count: result });
});
// post
app.post("/applications", async (req, res) => {
  const application = req.body;
  const result = await applicationsCollection.insertOne(application);
  res.send(result);
});

// update 
app.patch("/applications/:id",async(req,res)=>{
  const {id} = req.params;
  const result = await applicationsCollection.updateOne(
    {_id: new ObjectId(id)},
    {
      $set:{
        status: req.body.status
      }
    }
  )
  res.send(result);
})

// Payment related api
app.post("/payment/checkout-verify", async (req, res) => {
  const { sessionId } = req.body;
  if(!sessionId){
    return res.send({success: false, message: "Session ID is required"});
  }
  const { status, customer_email, metadata, payment_intent, payment_status } =
    await stripe.checkout.sessions.retrieve(sessionId);
  if(status === "complete" && payment_status === "paid"){
    const existingPament = await paymentCollection.findOne({sessionId});
    if(existingPament){
      return res.send({success: false, message: "Payment already exists"});
    }
    const payments = {
      status,
      customer_email,
      payment_intent,
      payment_status,
      sessionId,
      payment_Date: new Date(),
      userId: metadata.userId,
    };
    const result = await paymentCollection.insertOne(payments)
    const updatedUser = await userCollection.updateOne(
      {_id: new ObjectId(metadata.userId)},
      {
        $set:{
          premium: true
        }
      }
    )
    res.send({success: true, result, updatedUser})
  }
  res.send({success: false, message: "Payment not completed"});
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
