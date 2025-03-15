async function downloadYouTubeAudio(url: string): Promise<string | null> {
  const outputFilePath = "audio.mp3"; // Specify the output file path
  const process = Deno.run({
    cmd: ["yt-dlp", "-x", "--audio-format", "mp3", "-o", outputFilePath, url],
    stdout: "piped",
    stderr: "piped",
  });

  const { code } = await process.status();
  if (code === 0) {
    return outputFilePath; // Return the path to the downloaded audio file
  } else {
    const error = await process.stderrOutput();
    console.error(new TextDecoder().decode(error));
    return null;
  }
}
