// const Tesseract = require('tesseract.js');
const fetch = require('node-fetch');
const { createWorker } = require('tesseract.js');
const { createWriteStream, createReadStream } = require('fs');
const config = require('../config/config.js')

/**
 * Transcribes text from an image using Tesseract.
 * @param {Stream} input - The image stream to transcribe.
 * @returns {Promise<string>} A Promise that resolves with the transcribed text.
 */
const transcribeImage = async (input) => {
  const worker = await createWorker('por');
  const {data: {text}} = await worker.recognize(input);
  await worker.terminate();
  return text
  
};

/**
 * Downloads an image file from a URL and transcribes its contents using Tesseract.
 * @returns {Promise<void>} A Promise that resolves when the transcription is complete.
 */
module.exports = async (body) => {
  try {
    // fetch the image file from some CDN

    const accountSid = config.TWILIO_ACCOUNT_SID; 
    const authToken = config.TWILIO_AUTH_TOKEN; 
    const currentTime = new Date().getTime();

    const response = await fetch(body.MediaUrl0, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`
      }
    })
    
    // adjust the path to save the image in src/uploads/
    const imagePath = `src/uploads/temp-image-${currentTime}.jpg`;
    // define the image stream
    const imageStream = createWriteStream(imagePath);
   
    await response.body.pipe(imageStream);
    // wait for the image to download
    await new Promise((resolve) => imageStream.on('finish', resolve));

    // transcribe the image using Tesseract
    const transcription = await transcribeImage(imagePath);
    
    return transcription;
  } catch (error) {
    console.error(error);
    return error;
  }
};
