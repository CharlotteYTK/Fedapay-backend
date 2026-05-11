const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const admin = require("firebase-admin");

// FIREBASE (RENDER SAFE)
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});

const db = admin.firestore();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const FEDAPAY_SECRET = process.env.FEDAPAY_SECRET;

// CREATE PAYMENT
app.post("/create-payment", async (req, res) => {
  try {
    const { amount, email, name, orderId } = req.body;

    const response = await fetch(
      "https://api.fedapay.com/v1/transactions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FEDAPAY_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          description: `Commande ${orderId}`,
          amount,
          currency: { iso: "XOF" },

          callback_url: "https://fedapay-backend-1.onrender.com/webhook",

          customer: {
            firstname: name,
            email,
          },

          metadata: { orderId },
        }),
      }
    );

    const data = await response.json();

    const transaction =
      data?.v1?.transaction || data?.transaction;

    if (!transaction) return res.status(500).json(data);

    const transactionId = transaction.id;

    const tokenResponse = await fetch(
      `https://api.fedapay.com/v1/transactions/${transactionId}/token`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FEDAPAY_SECRET}`,
          "Content-Type": "application/json",
        },
      }
    );

    const tokenData = await tokenResponse.json();

    await db.collection("orders").doc(orderId).set({
      orderId,
      amount,
      email,
      status: "pending",
      transactionId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ payment_url: tokenData.url });

  } catch (e) {
    console.log(e);
    res.status(500).json({ error: e.toString() });
  }
});

// WEBHOOK
app.post("/webhook", async (req, res) => {
  try {
    const transaction = req.body?.entity;

    if (!transaction) return res.sendStatus(200);

    const orderId = transaction?.metadata?.orderId;

    if (!orderId) return res.sendStatus(200);

    if (["approved", "success"].includes(transaction.status)) {
      await db.collection("orders").doc(orderId).update({
        status: "paid",
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    res.sendStatus(200);
  } catch (e) {
    console.log(e);
    res.sendStatus(500);
  }
});

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});