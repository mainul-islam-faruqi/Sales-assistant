const twilio = require("twilio");
const chatCompletion = require("./chat-completion.js");
const transcript = require("./transcript.js");
const imageTranscript = require("./imageTranscript.js")
const config = require("../config/config.js");
const whatsappChatbot = require("./whatsappChatbot")
const knowledgeBaseSalesAgent = require("./knowledgeBaseSalesAgent.js")
const client = require('twilio')(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);

module.exports = async (req, res) => {
  try {
    let message;

    twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN); // Create a Twilio client
    const twiml = new twilio.twiml.MessagingResponse(); // Create a new Twilio Response object and send a message
    
    // console.log('twiml', twiml)
    // Check if the request is a text message or audio file

    if (req.body.Body) {
      message = req.body.Body;
    } else if (req.body.MediaContentType0 && req.body.MediaContentType0.includes("image")) {
      const prescriptionText = await imageTranscript(req.body);
      message = await chatCompletion(prescriptionText);
      // console.log(message)
    } else {
      twiml.message("Please send a message or image");
      return res.status(200).send(twiml.toString());
    }

    // Process message with OpenAI's GPT API and return response
    
    const response = await whatsappChatbot(message, req.body.MediaContentType0 && req.body.MediaContentType0.includes("image") ? true : false);
    
    const result = await knowledgeBaseSalesAgent(message)
   
    if (response.error) {
      // handle error, maybe send a message about the error to WhatsApp
      twiml.message(`Error: ${response.error}`);
      return res.status(200).send(twiml.toString());
    } else {
      const chunkSize = 1597;
      const chunks = Math.ceil(response.length / chunkSize)
      for (let i = 0; i < chunks; i++) {
        console.log('response.length', response.length)
        client.messages
        .create({
          from: req.body.To,
          body: i === chunks-1 ? response.substr(i * chunkSize, chunkSize) : `${response.substr(i * chunkSize, chunkSize)}...`,
          to: req.body.From
        })
          .then(message => {
            console.log(message.body)
            res.set("Content-Type", "text/xml");
            res.status(200).send(twiml.toString());
        });
      }

      
    }
    
  } catch (error) {
    console.error(error);
    res.status(500).send({
      message: "Something went wrong",
      error: error
    });
  }
};
