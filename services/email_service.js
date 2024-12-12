require("dotenv").config();
const nodemailer = require("nodemailer");
const { google } = require("googleapis");
const OAuth2 = google.auth.OAuth2;

const createTransporter = async () => {
  try {
    const oauth2Client = new OAuth2(
      process.env.EMAIL_CLIENT_ID,
      process.env.EMAIL_CLIENT_SECRET,
      "https://developers.google.com/oauthplayground"
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.EMIAL_REFRESH_TOKEN,
    });

    const accessToken = await new Promise((resolve, reject) => {
      oauth2Client.getAccessToken((err, token) => {
        if (err) {
          console.log("*ERR: ", err);
          reject();
        }
        resolve(token);
      });
    });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: process.env.USER_EMAIL,
        accessToken,
        clientId: process.env.EMAIL_CLIENT_ID,
        clientSecret: process.env.EMAIL_CLIENT_SECRET,
        refreshToken: process.env.EMIAL_REFRESH_TOKEN,
      },
    });
    return transporter;
  } catch (err) {
    return err;
  }
};

const sendEmailRequest = async (to, roomName, pagelink) => {
  try {
    const mailOptions = {
      from: process.env.USER_EMAIL,
      to,
      subject: `Want to join The Room ${roomName}`,
      html: `<b>Hello User, I want to join the ${roomName} you have created. Please approve my request so I can join the room.</b>
              <li><a href=${pagelink}>Click Here</a> to see the request and for action</li>`,
    };

    let emailTransporter = await createTransporter();
    await emailTransporter.sendMail(mailOptions);
  } catch (err) {
    console.log("ERROR: ", err);
  }
};

const sendEmailAprovel = async (to, userName, roomName) => {
  try {
    const mailOptions = {
      from: process.env.USER_EMAIL,
      to,
      subject: `Got Approvel From the Creator!!`,
      html: `<b>Hello ${userName}, Your request for joining the room ${roomName} has approved.</b></br><b>now you can Chat in the room ${roomName}.</b></br>
               <b>Thank you for using our Application.</b>`,
    };

    let emailTransporter = await createTransporter();
    await emailTransporter.sendMail(mailOptions);
  } catch (err) {
    console.log("ERROR: ", err);
  }
};
module.exports = { sendEmailRequest, sendEmailAprovel };
