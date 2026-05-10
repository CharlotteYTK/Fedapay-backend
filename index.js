const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

// 🔥 Firebase Realtime Database URL
const FIREBASE_URL = "https://yanalex-8a150-default-rtdb.firebaseio.com";

app.post("/fedapay-callback", async (req, res) => {
  try {
    console.log("CALLBACK RECEIVED:", req.body);

    const data = req.body;

    const orderId =
      data?.metadata?.orderId ||
      data?.v1_transaction?.metadata?.orderId;

    const status =
      data?.status ||
      data?.v1_transaction?.status;

    if (!orderId) {
      return res.status(400).send("Missing orderId");
    }

    if (
      status === "approved" ||
      status === "successful" ||
      status === "completed"
    ) {
      await axios.patch(
        `${FIREBASE_URL}/orders/${orderId}.json`,
        {
          paymentStatus: "paid",
          status: "processing",
          paidAt: Date.now()
        }
      );

      console.log("✅ ORDER UPDATED");
    }

    return res.sendStatus(200);
  } catch (e) {
    console.log("ERROR:", e);
    return res.sendStatus(500);
  }
});

app.listen(3000, () => {
  console.log("Backend running on port 3000");
});