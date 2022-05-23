const express = require('express');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 5000
const jwt = require('jsonwebtoken');


require('dotenv').config()

app.use(cors());
app.use(express.json())


// stripe
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);


// verifyToken

const verifyToken = (req, res, next) => {
    const authorization = req.headers.authorization;

    if (authorization) {

        const accessToken = authorization.split(" ")[1];
        // console.log(accessToken);

        jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
            if (err) {
                console.log(err)
                return res.status(403).send({ message: "Forbidden Access 1" });
            }
            req.decoded = decoded;
            next()
        })
    }
    else {
        return res.status(401).send({ message: "Unauthorised" })
    }

}



// DB CONNECTION
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@doctorportal.tp7ce.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

const connectDB = async () => {

    try {

        await client.connect();
        const serviceCollection = client.db("doctor_portal").collection("services");
        const bookingCollection = client.db("doctor_portal").collection("bookings");
        const userCollection = client.db("doctor_portal").collection("users");
        const doctorCollection = client.db("doctor_portal").collection("doctors");
        const paymentCollection = client.db("doctor_portal").collection("payments");


        // middleware
        // verifyADmin

        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;

            const requesterUser = await userCollection.findOne({ email: requester });

            if (requesterUser.role === 'admin') {
                next()
            }
            else {
                res.status(403).send({ message: "Forbidden Access VerifyADmin" })
            }
        }






        /**
         * API NAMING CONVENSION
         * check steps.md file from client side
         * 
         */


        // user manage
        app.put("/user/:email", async (req, res) => {



            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };

            const options = {
                upsert: true,
            }

            const updateDoc = {
                $set: user,
            };

            const result = await userCollection.updateOne(filter, updateDoc, options);

            // create token for this user
            const token = jwt.sign({ email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });




            res.send({ result, token: token });

        })

        // get all users
        app.get("/users", verifyToken, async (req, res) => {
            const users = await userCollection.find().toArray();

            res.send(users)
        })

        // make admin an user

        app.put("/user/admin/:email", verifyToken, verifyAdmin, async (req, res) => {

            const email = req.params.email;
            const filter = { email: email };

            const updateDoc = {
                $set: {
                    role: 'admin',
                },
            };

            const result = await userCollection.updateOne(filter, updateDoc);

            res.send(result);

        })

        // check if admin
        app.get('/admin/:email', async (req, res) => {

            const email = req.params.email;

            const user = await userCollection.findOne({ email: email });
            if (user) {
                // console.log(user)
                const isAdmin = user.role === 'admin';

                res.send({ admin: isAdmin });
            }
            else {
                res.status(403).send({ message: "Forbidden access 4" });
            }
        })


        app.get("/services", async (req, res) => {
            const query = {};

            const cursor = serviceCollection.find(query).project({ name: 1 });
            const services = await cursor.toArray();

            res.send(services);

        })

        // this is not the proper way to query.
        // After learning more about mongodb, use aggregate lookup, pipline, match, group

        app.get('/available', async (req, res) => {
            const date = req.query.date || 'May 15, 2022'

            // step 1 : get all services
            const services = await serviceCollection.find().toArray();

            // step 2: get booking of that day

            const query = { date: date };

            const bookings = await bookingCollection.find(query).toArray();

            // step 3 : for each service , find bookings for that service

            services.forEach(service => {

                // for each service find the bookings for that service
                // [{},{},{}]
                const serviceBookings = bookings.filter(b => b.treatmentName === service.name);

                // select slots for th service bookings
                // ['','','','']
                const bookedSlots = serviceBookings.map(booking => booking.slot)

                // select thos slots that are not in booked slots

                const available = service.slots.filter(s => !bookedSlots.includes(s));

                service.slots = available;
                // service.booked = bookedSlots




            })



            res.send(services)
        })
        

        // get booking by user

        app.get('/booking', verifyToken, async (req, res) => {

            // console.log(req.decoded);

            const email = req.query.patient;

            if (email === req.decoded.email) {


                const query = {
                    patient: email
                }
                const bookings = await bookingCollection.find(query).toArray();

                res.send(bookings);
            }
            else {
                res.status(403).send({ message: 'Forbidden Access 3' })
            }

        })


        // make a booking / appointment

        app.post('/booking',verifyToken, async (req, res) => {


            const booking = req.body;
            // console.log(booking);

            const query = {
                treatmentName: booking.treatmentName,
                date: booking.date,
                patient: booking.patient
            }

            const exist = await bookingCollection.findOne(query);

            if (exist) {

                return res.send({ success: false, message: "Already Have A booking", booking: exist });

            } else {

                const result = await bookingCollection.insertOne(booking);

                res.send({ success: true, result });

            }


        })

        
        // dashboard/payment/:id

        app.get('/booking/:id',verifyToken, async (req, res) => {
            
            const id = req.params.id;
            const query = {
                _id:ObjectId(id),
            }
            const booking = await bookingCollection.findOne(query);
            // console.log(booking);
            res.send(booking);
        })



        // get all doctors

        app.get("/doctors", verifyToken, verifyAdmin, async (req, res) => {
            const doctors = await doctorCollection.find().toArray();

            res.send(doctors);
        })


        //  add new doctor
        app.post("/add-doctor", verifyToken, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            console.log(doctor);
            const result = await doctorCollection.insertOne(doctor);
            res.send(result);




        })

        // delete a doctor

        app.delete("/doctor/:email", verifyToken, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email }

            const result = await doctorCollection.deleteOne(filter)

            res.send(result)

        })


        // payment apis and configuration

        app.post('/create-payment-intent', verifyToken, async (req, res) =>{
            
            const service = req.body;
            const price = service.price;
            const amount = price * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                amount:amount,
                currency: 'usd',
                payment_method_types:['card']
            });

            res.send({clientSecret:paymentIntent.client_secret})


        })

        // update booking object paid status
        app.patch('/booking/:id', verifyToken, async (req,res)=>{
            const id = req.params.id;
            const payment = req.body
            const query = {
                _id:ObjectId(id),
            }
            const updatedDoc = {
                $set:{
                    paid:true,
                    transactionId : payment.transactionId
                }
            }

            const updateBooking = await bookingCollection.updateOne(query,updatedDoc)
            const result = await paymentCollection.insertOne(payment)

            res.send(result)
        })


    }

    catch (err) {
        console.error(err);
    }


}

connectDB().catch(console.dir);

app.get('/', (req, res) => {
    res.json({ result: true })

})

app.listen(port, () => {
    console.log(`listening on http://localhost:${port}`)
})