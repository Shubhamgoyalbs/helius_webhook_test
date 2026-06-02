import express from "express";

const app = express();

// Parse JSON body
app.use(express.json());

app.post("/webhook", async (req, res) => {
    console.log("=================================");
    console.log("Webhook received");
    console.log("Timestamp:", new Date().toISOString());
    console.log("Headers:", req.headers);
    console.log(
        "Body:",
        JSON.stringify(req.body, null, 2)
    );
    console.log("=================================");

    res.status(200).json({
        success: true,
    });
});

app.get("/", (_, res) => {
    res.send("Webhook server running");
});

export default app;