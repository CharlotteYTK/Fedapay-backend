const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});

const db = admin.database();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const FEDAPAY_SECRET = process.env.FEDAPAY_SECRET;

// ================= CREATE PAYMENT =================
app.post("/create-payment", async (req, res) => {
  try {
    const { amount, email, name, orderId } = req.body;

    console.log("CREATE PAYMENT:", req.body);

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
            firstname: name || "Client",
            email,
          },
          metadata: { orderId },
        }),
      }
    );

    const data = await response.json();

    const transaction = data?.v1?.transaction || data?.transaction;

    if (!transaction) {
      console.log("FEDA ERROR:", data);
      return res.status(500).json(data);
    }

    const transactionId = transaction.id;

    const tokenRes = await fetch(
      `https://api.fedapay.com/v1/transactions/${transactionId}/token`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FEDAPAY_SECRET}`,
        },
      }
    );

    const tokenData = await tokenRes.json();

    // SAVE ORDER
    await db.ref("orders/" + orderId).set({
      orderId,
      amount,
      email,
      status: "pending",
      transactionId,
      createdAt: Date.now(),
    });

    res.json({ payment_url: tokenData.url });
  } catch (e) {
    console.log("CREATE ERROR:", e);
    res.status(500).json({ error: e.toString() });
  }
});

// ================= WEBHOOK (IMPORTANT FIX) =================
app.post("/webhook", async (req, res) => {
  try {
    console.log("WEBHOOK RECEIVED:", JSON.stringify(req.body));

    const transaction = req.body?.entity;

    if (!transaction) {
      console.log("NO TRANSACTION");
      return res.sendStatus(200);
    }

    const orderId = transaction?.metadata?.orderId;

    if (!orderId) {
      console.log("NO ORDER ID");
      return res.sendStatus(200);
    }

    console.log("ORDER ID:", orderId);
    console.log("STATUS:", transaction.status);

    if (
      transaction.status === "approved" ||
      transaction.status === "success" ||
      transaction.status === "completed"
    ) {
      await db.ref("orders/" + orderId).update({
        status: "paid",
        paidAt: Date.now(),
      });

      console.log("PAYMENT SAVED TO FIREBASE");
    }

    res.sendStatus(200);
  } catch (e) {
    console.log("WEBHOOK ERROR:", e);
    res.sendStatus(200);
  }
});

app.listen(PORT, () => {
  console.log("Server running on", PORT);
});