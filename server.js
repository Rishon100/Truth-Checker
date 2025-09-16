// Import dependencies
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');
const cors = require('cors');

// Load .env file (API key should be saved there as API_KEY=your_key_here)
dotenv.config();

// Setup backend
const app = express();
app.use(cors());
app.use(express.json());

// Initialize Gemini with Google Search grounding
const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
  tools: [{ google_search: {} }] // ✅ enable real-time search
});

// Endpoint for verifying information
app.post('/verify', async (req, res) => {
  const userQuery = req.body.query;
  console.log("1. Query received:", userQuery);

  // Dynamic date (updates every day automatically)
  const today = new Date().toDateString();

  const prompt = `
Act as a real-time verification engine powered by Google Search.
User query: "${userQuery}"
Today's date: ${today}.

Format your answer into 3 sections:
1. **Summary:** Direct, up-to-date answer.
2. **Key Supporting Points:** 2–3 factual details.
3. **Trusted Sources:** 2–3 real URLs from the Google Search tool. If no reliable source found, say "No reliable source found."
`;

  try {
    console.log("2. Sending request to Google AI...");
    const result = await model.generateContent(prompt);

    // Handle response
    const response = result.response;
    const text = response.text();

    // Optional: log grounding data
    if (result.response.candidates?.[0]?.groundingMetadata) {
      console.log("Grounding sources:", result.response.candidates[0].groundingMetadata);
    }

    console.log("3. Received response from Google AI.");
    res.send({ result: text });

  } catch (error) {
    console.error("4. ERROR during Google AI call:", error);
    res.status(500).send({ error: "Something went wrong on the server." });
  }
});

// Start server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
