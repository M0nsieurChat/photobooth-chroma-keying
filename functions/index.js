// Firebase related requirements
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);
// Our database
var firestore = admin.firestore()
const peoples = firestore.collection('peoples');

// GCS for bucket interaction
var gcs = admin.storage()

// Twilio requirements
const accountSid = encodeURIComponent(functions.config().twilio.accountsid);
const authToken = encodeURIComponent(functions.config().twilio.authtoken);
var twilio = require('twilio');
var client = new twilio(accountSid, authToken);
const VoiceResponse = require('twilio').twiml.VoiceResponse;


// This is called on an inbound call on Twilio number(s)
exports.voice = functions.https.onRequest((request, response) => {
    // Use the Twilio Node.js SDK to build an XML response
    const twiml = new VoiceResponse();

    const gather = twiml.gather({
    numDigits: 1,
    action: '/gather',
    });
    gather.say({
        voice: "Polly.Mathieu",
        language: 'fr-FR'
    }, 'Appuie sur 1 pour recevoir les photos. Pour te désinscrire, appuie sur 2.');

    // If the user doesn't enter input, loop
    twiml.redirect('/voice');

    // Render the response as XML in reply to the webhook request
    response.type('text/xml');
    response.send(twiml.toString());
 });


 // This is called during a call whenever user press a dialkey (DTMF tone)
exports.gather = functions.https.onRequest((request, response) => {
  // Use the Twilio Node.js SDK to build an XML response
  const twiml = new VoiceResponse();

  // If the user entered digits, process their request
  if (request.body.Digits) {
    switch (request.body.Digits) {
      case '1':

        // Register the caller phone number inside Firestore.
        peoples.add({
            number: request.body.From 
        })

        twiml.say({
            voice: "Polly.Mathieu",
            language: 'fr-FR'
        } ,'Tu es maintenant inscrit ! A bientôt');
    
        break;
      case '2':
        // Search for documents with the caller phone number
        var tobeDeleted = peoples.where("number", "==", request.body.From)
        tobeDeleted.get().then(function(querySnapshot) {
            querySnapshot.forEach(function(doc) {
                // Delete the document
                doc.ref.delete();
              });
        })
        twiml.say({
            voice: "Polly.Mathieu",
            language: 'fr-FR'
        } ,'Tu es désinscrit de la liste ! A bientôt');
        break;
      default:
        twiml.say({
            voice: "Polly.Mathieu",
            language: 'fr-FR'
        }, "Sorry, I don't understand that choice.").pause();
        twiml.redirect('/voice');
        break;
    }
  } else {
    // If no input was sent, redirect to the /voice route
    twiml.redirect('/voice');
  }

  // Render the response as XML in reply to the webhook request
  response.type('text/xml');
  response.send(twiml.toString());
});

// Triggered by an object being uploaded in the firebase bucket
exports.sendPics = functions.storage.object().onFinalize((data) => {
    const bucket = data.bucket;
    const filePath = data.name;
    const destBucket = admin.storage().bucket(bucket);
    const file = destBucket.file(filePath);
    
    // Generate a download link with a long expiration
    return file.getSignedUrl({
        action: 'read',
        expires: '03-09-2491'
        }).then(signedUrls => {
          // The topic name can be optionally prefixed with "/topics/".
          var topic = 'margauxhugo';

          var message = {
            data: {
              title: "Nouvelle photo !",
              body: "Wow wow wow !",
              link: signedUrls[0]
            },
            webpush: {
              fcm_options: {
                link: signedUrls[0]
              }
            },
            topic: topic
          };

          // Send a message to devices subscribed to the provided topic.
          admin.messaging().send(message)
            .then((response) => {
              // Response is a message ID string.
              console.log('Successfully sent message:', response);
            })
            .catch((error) => {
              console.log('Error sending message:', error);
            });


        });
});

// Triggered by an Ajax request when a client accepts notifications
exports.subscribeToTopic = functions.https.onRequest((request, response) => {
  var registrationTokens = request.body.registrationToken
  const topic = "margauxhugo"
  
  console.log("Will try to register token", registrationTokens)
  // Subscribe the devices corresponding to the registration tokens to the
  // topic.
  admin.messaging().subscribeToTopic(registrationTokens, topic)
    .then(function(subscribeResponse) {
      // See the MessagingTopicManagementResponse reference documentation
      // for the contents of response.
      console.log('Successfully subscribed to topic:', subscribeResponse);
      response.status(200);
      response.send("OK !")
    })
    .catch(function(error) {
      console.log('Error subscribing to topic:', error);
    });
  
})