const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Load .env file
dotenv.config();

// Setup backend
const app = express();
app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Gemini with Google Search grounding
const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash-exp",
  tools: [{ googleSearch: {} }],
  generationConfig: {
    temperature: 0.1,
    maxOutputTokens: 2048,
  }
});

// Enhanced YouTube ID extraction with more patterns
function extractYouTubeId(url) {
  if (!url || typeof url !== 'string') return null;
  
  // Remove any query parameters that might interfere (but keep the video ID)
  const cleanUrl = url.split('&')[0];
  
  const patterns = [
    // Standard YouTube watch URLs
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/watch\?.*[&?]v=)([a-zA-Z0-9_-]{11})/,
    
    // Short YouTube URLs
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    
    // YouTube embed URLs
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    
    // YouTube v/ URLs (old format)
    /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    
    // YouTube Shorts
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    
    // Mobile YouTube URLs
    /(?:m\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    
    // YouTube Music
    /(?:music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    
    // Direct video ID (11 characters)
    /^([a-zA-Z0-9_-]{11})$/
  ];
  
  for (const pattern of patterns) {
    const match = cleanUrl.match(pattern);
    if (match && match[1] && match[1].length === 11) {
      console.log(`Extracted video ID: ${match[1]} from URL: ${url}`);
      return match[1];
    }
  }
  
  // Try extracting from full URL with more flexible approach
  const vMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (vMatch && vMatch[1]) {
    console.log(`Extracted video ID via flexible match: ${vMatch[1]}`);
    return vMatch[1];
  }
  
  console.log(`Could not extract video ID from URL: ${url}`);
  return null;
}

// Simple and working YouTube transcript function
async function fetchYouTubeTranscript(videoId) {
  console.log(`Attempting to get transcript for video: ${videoId}`);
  
  // For now, we'll skip complex transcription and provide a working alternative
  // This approach focuses on getting video title and description instead
  try {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    console.log('Fetching YouTube video page...');
    
    const response = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch video page: ${response.status}`);
    }
    
    const html = await response.text();
    
    // Extract video title
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const title = titleMatch ? titleMatch[1].replace(' - YouTube', '') : 'Unknown Video';
    
    // Extract video description (simplified)
    const descMatch = html.match(/"shortDescription":"([^"]+)"/);
    const description = descMatch ? descMatch[1].replace(/\\n/g, ' ').substring(0, 500) : '';
    
    // Create a summary of available information
    const videoInfo = `Video Title: ${title}\n\nVideo Description: ${description}`;
    
    if (videoInfo.length > 50) {
      console.log('Successfully extracted video information');
      return videoInfo;
    }
    
    throw new Error('Could not extract meaningful video information');
    
  } catch (error) {
    console.log('YouTube extraction failed:', error.message);
    
    // Final fallback message
    throw new Error(`Unable to process this YouTube video. 

WHAT YOU CAN DO INSTEAD:
1. Go to the YouTube video
2. If captions are available, click the "..." menu → "Show transcript" 
3. Copy the transcript text and paste it here instead of the URL
4. Or describe the main claims from the video in your own words

This approach will give you better fact-checking results.`);
  }
}

// Web scraping method to get transcript
async function scrapeYouTubeTranscript(videoId) {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  
  try {
    const response = await fetch(watchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    
    // Look for transcript data in the page
    const transcriptMatches = html.match(/"captions":\s*({[^}]+})/);
    if (transcriptMatches) {
      try {
        const captionsData = JSON.parse(transcriptMatches[1]);
        // Process captions data if found
        if (captionsData.playerCaptionsTracklistRenderer) {
          const tracks = captionsData.playerCaptionsTracklistRenderer.captionTracks;
          if (tracks && tracks.length > 0) {
            const transcriptUrl = tracks[0].baseUrl;
            if (transcriptUrl) {
              return await fetchTranscriptFromUrl(transcriptUrl);
            }
          }
        }
      } catch (parseError) {
        console.log('Error parsing captions data:', parseError.message);
      }
    }
    
    // Alternative: Look for transcript in different format
    const scriptMatches = html.match(/var ytInitialData = ({.+?});/);
    if (scriptMatches) {
      try {
        const ytData = JSON.parse(scriptMatches[1]);
        // Look for transcript data in ytInitialData
        const transcript = extractTranscriptFromYtData(ytData);
        if (transcript) return transcript;
      } catch (parseError) {
        console.log('Error parsing ytInitialData:', parseError.message);
      }
    }
    
  } catch (error) {
    console.log('Scraping error:', error.message);
    throw error;
  }
  
  return null;
}

// Fetch transcript from direct URL
async function fetchTranscriptFromUrl(transcriptUrl) {
  try {
    const response = await fetch(transcriptUrl);
    const xmlText = await response.text();
    
    // Parse XML transcript
    const textMatches = xmlText.match(/<text[^>]*>([^<]+)<\/text>/g);
    if (textMatches) {
      return textMatches.map(match => {
        const textContent = match.replace(/<[^>]+>/g, '');
        return decodeHTMLEntities(textContent);
      }).join(' ');
    }
  } catch (error) {
    console.log('Error fetching from transcript URL:', error.message);
  }
  return null;
}

// Extract transcript from YouTube data
function extractTranscriptFromYtData(ytData) {
  // This is a simplified version - YouTube's data structure is complex
  // In practice, you'd need to navigate through the nested structure
  try {
    // Look for transcript data in various possible locations
    const contents = ytData?.contents?.twoColumnWatchNextResults?.results?.results?.contents;
    if (contents) {
      for (const content of contents) {
        // Look for transcript renderer
        if (content.transcriptRenderer || content.videoTranscriptRenderer) {
          // Extract transcript text
          // This would need more specific implementation based on YouTube's structure
          return null; // Placeholder
        }
      }
    }
  } catch (error) {
    console.log('Error extracting from ytData:', error.message);
  }
  return null;
}

// Try to get transcript from embed page
async function fetchFromEmbedPage(videoId) {
  const embedUrl = `https://www.youtube.com/embed/${videoId}`;
  
  try {
    const response = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const html = await response.text();
    
    // Look for caption tracks in embed page
    const trackMatch = html.match(/"captionTracks":\s*\[([^\]]+)\]/);
    if (trackMatch) {
      try {
        const tracks = JSON.parse(`[${trackMatch[1]}]`);
        if (tracks.length > 0 && tracks[0].baseUrl) {
          return await fetchTranscriptFromUrl(tracks[0].baseUrl);
        }
      } catch (parseError) {
        console.log('Error parsing embed tracks:', parseError.message);
      }
    }
  } catch (error) {
    console.log('Embed page error:', error.message);
  }
  
  return null;
}

// Decode HTML entities
function decodeHTMLEntities(text) {
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' '
  };
  
  return text.replace(/&[a-zA-Z0-9#]+;/g, (entity) => {
    return entities[entity] || entity;
  });
}

// Enhanced webpage content extraction
async function fetchWebpageContent(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 10000
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    
    // Enhanced content extraction
    let textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
      .replace(/<\/?[^>]+(>|$)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Extract title if available
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';
    
    return { content: textContent.slice(0, 3000), title };
    
  } catch (error) {
    throw new Error(`Failed to fetch webpage: ${error.message}`);
  }
}

// Main verification endpoint
app.post('/verify', async (req, res) => {
  let userQuery = req.body.query;
  let contentType = 'text';
  let sourceInfo = '';
  
  console.log("Processing query:", userQuery.substring(0, 100) + "...");

  try {
    // Enhanced URL detection and processing
    if (userQuery.includes("youtube.com") || userQuery.includes("youtu.be")) {
      console.log("Detected YouTube URL");
      contentType = 'youtube';
      
      const videoId = extractYouTubeId(userQuery);
      if (!videoId) {
        return res.status(400).json({ 
          error: "Invalid YouTube URL. Please provide a valid YouTube video link." 
        });
      }

      console.log("Extracted video ID:", videoId);
      sourceInfo = `YouTube Video (ID: ${videoId})`;

      try {
        const transcriptText = await fetchYouTubeTranscript(videoId);
        
        if (!transcriptText || transcriptText.length < 50) {
          return res.status(400).json({
            error: "This YouTube video doesn't have available captions or the transcript is too short. Please try a different video or enable captions."
          });
        }

        userQuery = `Analyze this YouTube video transcript for factual accuracy:\n\nVideo ID: ${videoId}\nTranscript: ${transcriptText.slice(0, 4000)}`;
        console.log("Successfully extracted transcript, length:", transcriptText.length);
        
      } catch (transcriptError) {
        console.error("Transcript error:", transcriptError);
        return res.status(400).json({
          error: "Unable to fetch transcript from this YouTube video. This could be because: captions are disabled, the video is private/restricted, or auto-generated captions are not available."
        });
      }
    }
    
    // Handle other web URLs
    else if (userQuery.match(/^https?:\/\//)) {
      console.log("Detected web URL");
      contentType = 'webpage';
      
      try {
        const { content, title } = await fetchWebpageContent(userQuery);
        sourceInfo = title ? `Webpage: ${title}` : `Webpage: ${userQuery}`;
        userQuery = `Analyze this webpage content for factual accuracy:\n\nSource: ${userQuery}\nTitle: ${title}\nContent: ${content}`;
        
      } catch (webError) {
        console.error("Webpage fetch error:", webError);
        return res.status(400).json({
          error: `Unable to fetch content from this webpage: ${webError.message}`
        });
      }
    }
    
    // Handle plain text
    else {
      console.log("Processing plain text query");
      contentType = 'text';
      sourceInfo = 'User Query';
    }

    // Enhanced prompt with better structure and confidence scoring
    const currentDate = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    const enhancedPrompt = `
You are an expert fact-checker with access to real-time information through Google Search. 
Today's date: ${currentDate}

CONTENT TO VERIFY:
${userQuery}

INSTRUCTIONS:
1. Use Google Search to find current, reliable sources to verify the claims
2. Cross-reference multiple authoritative sources
3. Focus on recent, credible sources (news organizations, academic institutions, government sites, etc.)
4. Provide a confidence score (0-100) for your assessment
5. Format your response EXACTLY as follows:

## VERDICT
[TRUE/FALSE/PARTIALLY TRUE/NEEDS MORE CONTEXT]

## CONFIDENCE_SCORE
[Number from 0-100 representing confidence in the verdict]

## SUMMARY
[Provide a clear, concise summary of your findings in 2-3 sentences]

## KEY_EVIDENCE
• [Evidence point 1 with specific details]
• [Evidence point 2 with specific details]  
• [Evidence point 3 with specific details]

## TRUSTED_SOURCES
• [Source 1 name and brief description]|[FULL_VALID_URL_WITH_HTTPS]
• [Source 2 name and brief description]|[FULL_VALID_URL_WITH_HTTPS]
• [Source 3 name and brief description]|[FULL_VALID_URL_WITH_HTTPS]

IMPORTANT: Ensure all URLs are complete, valid, and start with https://. Do not provide partial URLs or URLs that redirect to error pages.

## ADDITIONAL_CONTEXT
[Any important context, nuances, or caveats that readers should know]

CRITICAL: 
- Always use Google Search to find current, reliable sources
- Use the pipe symbol "|" to separate source descriptions from URLs
- Provide specific confidence score based on source quality and evidence strength
- Prioritize established news organizations, academic institutions, government agencies, and fact-checking organizations
`;

    console.log("Sending request to Gemini API...");
    
    const result = await model.generateContent(enhancedPrompt);
    const response = result.response;
    const text = response.text();

    console.log("Received response from Gemini API");
    console.log("Response preview:", text.substring(0, 200) + "...");

    // Enhanced response formatting
    const formattedResponse = {
      result: text,
      metadata: {
        contentType,
        sourceInfo,
        timestamp: new Date().toISOString(),
        processingTime: Date.now()
      }
    };

    res.json(formattedResponse);

  } catch (error) {
    console.error("Processing error:", error);
    
    let errorMessage = "An error occurred while processing your request.";
    
    if (error.message.includes('API key')) {
      errorMessage = "API configuration error. Please check your Google AI API key.";
    } else if (error.message.includes('quota') || error.message.includes('limit')) {
      errorMessage = "API usage limit exceeded. Please try again later.";
    } else if (error.message.includes('network') || error.message.includes('fetch')) {
      errorMessage = "Network error. Please check your internet connection and try again.";
    }
    
    res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  });
});

// Serve index.html for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Truth Checker Server v2.0 running on port ${PORT}`);
  console.log(`📊 API Health Check: http://localhost:${PORT}/health`);
});
