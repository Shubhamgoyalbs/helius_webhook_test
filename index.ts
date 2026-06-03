import express from "express";
import { Program } from "@coral-xyz/anchor";
import type { CounterPda } from "./counter_pda";
import * as anchor from "@coral-xyz/anchor";
import bs58 from "bs58";
import idl from "./counter_pda.json" with { type: "json" };

const connection = new anchor.web3.Connection("https://api.devnet.solana.com");
const secretKey = bs58.decode(
  "SMxSqgyejg7Xq2RGsRh5HsZzHDVKfJ5djn4PJoVbz45wV8dyGsPqb8NtPguKxc6CD6JjzvZbmFRaEybMaaksEsN",
);
const keypair = anchor.web3.Keypair.fromSecretKey(secretKey);
const provider = new anchor.AnchorProvider(
  connection,
  new anchor.Wallet(keypair),
  {},
);
anchor.setProvider(provider);
const program = new Program<CounterPda>(idl as CounterPda, provider);

const [eventAuthorityPda] = anchor.web3.PublicKey.findProgramAddressSync(
  [Buffer.from("__event_authority")],
  program.programId,
);

type HeliusInstruction = {
  accounts: string[];
  data: string;
  programId: string;
  innerInstructions?: HeliusInstruction[];
};

type HeliusTransaction = {
  accountData: {
    account: string;
    nativeBalanceChange: number;
    tokenBalanceChanges: unknown[];
  }[];
  description: string;
  events: Record<string, unknown>;
  fee: number;
  feePayer: string;
  instructions: HeliusInstruction[];
  lighthouseData: null | unknown;
  nativeTransfers: unknown[];
  signature: string;
  slot: number;
  source: string;
  timestamp: number;
  tokenTransfers: unknown[];
  transactionError: null | unknown;
  type: string;
};

type HeliusWebhookBody = HeliusTransaction[];

function decodeEmitCpiEvents(instructions: HeliusInstruction[]) {
  const results: { name: string; data: unknown }[] = [];

  for (const ix of instructions) {
    for (const inner of ix.innerInstructions ?? []) {
      const isSelfCpi = inner.programId === program.programId.toBase58();
      const hasEventAuthority = inner.accounts.includes(
        eventAuthorityPda.toBase58(),
      );

      if (!isSelfCpi || !hasEventAuthority) continue;

      const buf = Buffer.from(bs58.decode(inner.data));
      const event = program.coder.events.decode(
        buf.slice(8).toString("base64"),
      );

      if (event) {
        results.push(event);
      }
    }
  }

  return results;
}

function processHeliusWebhook(body: HeliusWebhookBody) {
  for (const tx of body) {
    console.log("\n── Transaction ──────────────────────────────");
    console.log("   signature :", tx.signature);
    console.log("   slot      :", tx.slot);
    console.log("   timestamp :", new Date(tx.timestamp * 1000).toISOString());
    console.log("   feePayer  :", tx.feePayer);

    const events = decodeEmitCpiEvents(tx.instructions);

    if (events.length === 0) {
      console.log("   no emit_cpi events found");
    } else {
      for (const event of events) {
        console.log("\nEvent name:", event.name);
        console.log("Event data:", event.data);
      }
    }
  }
}

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

app.post("/webhook", async (req, res) => {
  console.log("=================================");
  console.log("Webhook received");
  console.log("Timestamp:", new Date().toISOString());

  try {
    const body = req.body as HeliusWebhookBody;

    // Guard: Helius always sends an array
    if (!Array.isArray(body)) {
      console.error("❌ Unexpected body shape:", typeof body);
      res.status(400).json({ success: false, error: "expected array" });
      return;
    }

    processHeliusWebhook(body);

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("❌ Error processing webhook:", err);
    res.status(500).json({ success: false, error: String(err) });
  }

  console.log("=================================");
});

app.get("/", (_, res) => {
  res.send("Webhook server running");
});

export default app;
