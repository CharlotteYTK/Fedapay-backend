const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

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
          customer: {
            firstname: name,
            email,
          },
          metadata: { orderId },
        }),
      }
    );

    const data = await response.json();

    const transaction = data?.v1?.transaction || data?.transaction;

    if (!transaction) return res.status(500).json(data);

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

    return res.json({
      payment_url: tokenData.url,
      transactionId,
    });
  } catch (e) {
    return res.status(500).json({ error: e.toString() });
  }
});

app.listen(PORT, () => {
  console.log("Server running on", PORT);
});