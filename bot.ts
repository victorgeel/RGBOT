import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

// Your API keys and bot token
const TELEGRAM_BOT_TOKEN = "YOUR_TELEGRAM_BOT_TOKEN"; // Replace with your bot token
const YOUTUBE_API_KEY = "YOUR_YOUTUBE_API_KEY"; // Replace with your YouTube API key
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const YOUTUBE_API_URL = `https://www.googleapis.com/youtube/v3/search?key=${YOUTUBE_API_KEY}&part=snippet&type=video&q=`;

// Start the server
const PORT = 8080;
console.log(`Bot is running on port ${PORT}`);

async function handleTelegramUpdate(update: any) {
  if (update.message && update.message.text && update.message.chat) {
    const chatId = update.message.chat.id;
    const messageText = update.message.text;

    if (messageText.startsWith("/play ")) {
      const query = messageText.slice(6).trim();
      if (query.length === 0) {
        await sendTelegramMessage(chatId, "Please provide a search query after `/play`.");
        return;
      }

      const youtubeUrl = await searchYouTube(query);
      if (youtubeUrl) {
        const audioFilePath = await downloadYouTubeAudio(youtubeUrl);
        if (audioFilePath) {
          await sendVoice(chatId, audioFilePath);
        } else {
          await sendTelegramMessage(chatId, "Sorry, I couldn't download the audio.");
        }
      } else {
        await sendTelegramMessage(chatId, "No videos found for your query.");
      }
    }
  }
}

// Function to send a message to Telegram
async function sendTelegramMessage(chatId: number, text: string) {
  await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

// Function to search for YouTube videos
async function searchYouTube(query: string): Promise<string | null> {
  const response = await fetch(`${YOUTUBE_API_URL}${encodeURIComponent(query)}`);
  const data = await response.json();
  if (data.items && data.items.length > 0) {
    const videoId = data.items[0].id.videoId;
    return `https://www.youtube.com/watch?v=${videoId}`;
  }
  return null;
}

// Function to download audio from YouTube (you'll need to implement this)
async function downloadYouTubeAudio(url: string): Promise<string | null> {
  // Implement the logic to download audio from the YouTube URL
  // You can use a library like ytdl-core in Node.js or find a suitable Deno library
  return "path/to/downloaded/audio.ogg"; // Return the path to the downloaded audio file
}

// Function to send voice message
async function sendVoice(chatId: number, audioFilePath: string) {
  const formData = new FormData();
  formData.append("chat_id", chatId.toString());
  formData.append("voice", await Deno.open(audioFilePath)); // Open the audio file

  await fetch(`${TELEGRAM_API_URL}/sendVoice`, {
    method: "POST",
    body: formData,
  });
}

// Main request handler to process incoming Telegram updates
async function handleRequest(request: Request): Promise<Response> {
  if (request.method === "POST") {
    const update = await request.json();
    await handleTelegramUpdate(update);
    return new Response("OK");
  } else {
    return new Response("Bot is running", { status: 200 });
  }
}

// Start the server
serve(handleRequest, { port: PORT });
