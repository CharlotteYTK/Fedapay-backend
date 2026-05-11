const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const admin = require("firebase-admin");

// =========================
// FIREBASE INIT (RENDER SAFE)
// =========================

if (
  !process.env.FIREBASE_PROJECT_ID ||
  !process.env.FIREBASE_CLIENT_EMAIL ||
  !process.env.FIREBASE_PRIVATE_KEY
) {
  throw new Error("Firebase environment variables missing");
}

const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});

// 🔥 Realtime Database (IMPORTANT)
const db = admin.database();

// =========================
// APP INIT
// =========================

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const FEDAPAY_SECRET = process.env.FEDAPAY_SECRET;

// =========================
// CREATE PAYMENT
// =========================

app.post("/create-payment", async (req, res) => {
  try {
    const { amount, email, name, orderId } = req.body;

    if (!amount || !email || !orderId) {
      return res.status(400).json({ error: "Missing fields" });
    }

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
          metadata: {
            orderId,
          },
        }),
      }
    );

    const data = await response.json();

    const transaction =
      data?.v1?.transaction || data?.transaction;

    if (!transaction) {
      return res.status(500).json({
        error: "Transaction creation failed",
        data,
      });
    }

    const transactionId = transaction.id;

    // =========================
    // GET PAYMENT TOKEN
    // =========================

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

    if (!tokenData?.url) {
      return res.status(500).json({
        error: "Payment URL not generated",
      });
    }

    // =========================
    // SAVE ORDER (Realtime DB)
    // =========================

    await db.ref("orders/" + orderId).set({
      orderId,
      amount,
      email,
      status: "pending",
      transactionId,
      createdAt: Date.now(),
    });

    return res.json({
      payment_url: tokenData.url,
    });

  } catch (e) {
    console.log("CREATE PAYMENT ERROR:", e);
    return res.status(500).json({ error: e.toString() });
  }
});

// =========================
// WEBHOOK FEDA PAY
// =========================

app.post("/webhook", async (req, res) => {
  try {
    console.log("WEBHOOK RECEIVED:", req.body);

    const transaction = req.body?.entity;

    if (!transaction) return res.sendStatus(200);

    const orderId = transaction?.metadata?.orderId;

    if (!orderId) return res.sendStatus(200);

    const status = transaction.status;

    const isPaid =
      status === "approved" ||
      status === "success" ||
      status === "completed";

    if (isPaid) {
      await db.ref("orders/" + orderId).update({
        status: "paid",
        paidAt: Date.now(),
      });

      console.log("ORDER PAID:", orderId);
    }

    return res.sendStatus(200);

  } catch (e) {
    console.log("WEBHOOK ERROR:", e);
    return res.sendStatus(200);
  }
});

// =========================
// START SERVER
// =========================

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});