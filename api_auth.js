const bcrypt = require("bcrypt");
const express = require("express");
const formidable = require("formidable");
const path = require("path");
const fs = require("fs-extra"); 
const router = express.Router();
const jsonwebtoken = require("jsonwebtoken");
const jwt = require("./jwt");
const Users = require("./models/user_schema");
//sendgrid
const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(
  process.env.SENDGRID_API_KEY
);

//funcitons
uploadImage = async (files, doc) => {
  if (files.avatars != null) {
    var fileExtention = files.avatars.name.split(".").pop();
    doc.avatars = `${Date.now()}+${doc.username}.${fileExtention}`;
    var newpath =
      path.resolve(__dirname + "/uploaded/images/") + "/" + doc.avatars;

    if (fs.exists(newpath)) {
      await fs.remove(newpath);
    }
    await fs.move(files.avatars.path, newpath);

    await Users.findOneAndUpdate({ _id: doc.id }, doc);
  }
};

//Routes
router.get("/", function(req, res, next) {
  return res.send("Hello Nodejs");
});

router.post("/login", async (req, res) => {
  let doc = await Users.findOne({ username: req.body.username });
  if (doc) {
    if (bcrypt.compareSync(req.body.password, doc.password)) {
      //function to ensure that only the users who have activated the account can log in to the account. 
      //If the user status is not activated, logging in is denied.   
      if(doc.status != "not_activate"){

      
        const payload = {
          id: doc._id,
          level: doc.level,
          username: doc.username
        };

        let token = jwt.sign(payload);
        console.log(token);
        res.json({ result: "success", token, message: "Login successfully" });
      }else{
        return res.json({result:"error",message:"You need to activate account first"});

      }
    } else {
      // Invalid password
      res.json({ result: "error", message: "Invalid password" });
    }
  } else {
    // Invalid username
    res.json({ result: "error", message: "Invalid username" });
  }
});


router.post("/register", async (req, res) => {
  try {
    req.body.password = await bcrypt.hash(req.body.password, 8);
 
    const { first_name, last_name, email } = req.body;
    console.log( first_name, last_name, email)
    const token = jsonwebtoken.sign(
      { first_name, last_name, email },
      process.env.JWT_ACCOUNT_ACTIVATION,
      { expiresIn: "365d" }
    );
    console.log(token);
    const emailData = {
      from: "alanarguelho2@gmail.com",
      to: email,
      subject: `Account activation link`,
      html: ` <html>
            <head>
              <base href="" target="_blank"/>
            </head>
            <body>

            <h1>Please use the following link to reset your password</h1>


            <p>This link will expired in 60 minutes</p>


            <a href="${process.env.REACT_APP_API_URL}activation/${token}" >Ative sua conta</a> 

            </body>
            </html>  
          
      `
    };
    console.log(emailData);
    req.body.activated_token = token;
    let user = await Users.create(req.body);
    console.log(user);
    sgMail
      .send(emailData)
      .then(sent => {
        // console.log('SIGNUP EMAIL SENT', sent)
        return res.json({
          result: "warning",
          message: `Um link de confirmação foi enviado para ${email}.`
        });
      })
      .catch(err => {
        console.log(err.response.body.errors);
        return res.json({
          result: "error",
          message: err.message
        });
      });
  } catch (err) {
    return res.json({ result: "error", message: err.errmsg });
  }
});

// //the activation route to activate the account through the sent activation link.
router.get("/activation/:token", async (req, res) => {
  let token = req.params.token;
  console.log(token);
  if (token) {
    jsonwebtoken.verify(token, process.env.JWT_ACCOUNT_ACTIVATION, function(
      err,
      decoded
    ) {
      if (err) {
        console.log("JWT VERIFY IN ACCOUNT ACTIVATION ERROR", err);
        return res.redirect(`${process.env.REACT_APP_URL}login/error`);
        // return res.send("Error na ativação")
      }
      console.log(decoded);
    });
    let updatedFields = {
      status: "active",
      activated_token: ""
    };
    let doc = await Users.findOneAndUpdate(
      { activated_token: token },
      updatedFields
    );
    return res.redirect(`${process.env.REACT_APP_URL}login/success`);
    // return console.log(doc);
  }
});
//To send the an email password update resquest 
router.post("/password/reset", async (req, res) => {
  let expired_time = "60m";
  const { email } = req.body;
  Users.findOne({ email }, (err, user) => {
    if (err || !user) {
      return res.json({
        result: "error",
        message: "User with that email does not exist"
      });
    }

    const token = jsonwebtoken.sign(
      { _id: user._id, name: user.first_name },
      process.env.JWT_RESET_PASSWORD,
      {
        expiresIn: expired_time
      }
    );

    const emailData = {
      from: "alanarguelho2@gmail.com",
      to: email,
      subject: `Password Reset link`,
      html: `   <html>
                <head>
                <base href="" target="_blank"/>
                </head>
                <body>

                <h1>Please use the following link to reset your password</h1>


                <p>This link will expired in 60 minutes</p>


                <a href="${process.env.REACT_APP_URL}password/reset/${token}">Resetar senha</a> 

                </body>
                </html>  
               
                
            `
    };

    user.updateOne({ resetPasswordToken: token }, (err, success) => {
      if (err) {
        console.log("RESET PASSWORD LINK ERROR", err);
        return res.status(400).json({
          result: "error",
          message: "Database connection error on user password forgot request"
        });
      } else {
        sgMail
          .send(emailData)
          .then(response => {
            return res.json({
              result: "success",
              message: `Email has been sent to ${email}. Follow the instruction to activate your account`
            });
          })
          .catch(err => {
            console.log(err);
            return res.json({ result: "error", message: err.message });
          });
      }
    });
  });
});

//To update the password, getting the token from url
//by "query"
router.put("/password/reset", async (req, res) => {
  const { password } = req.body;
 let resetPasswordToken = req.query.token;
 console.log(resetPasswordToken);
 if (resetPasswordToken) {
   jsonwebtoken.verify(
     resetPasswordToken,
     process.env.JWT_RESET_PASSWORD,
     function(err, decoded) {
       if (err) {
         return res.json({
           result: "error",
           message: "Expired link. Try again"
         });
       }
     }
   );
   let encrypt_pass = await bcrypt.hash(password, 8);
   let updatedFields = {
     password: encrypt_pass,
     resetPasswordToken: ""
   };
  
   await Users.findOneAndUpdate(
     { resetPasswordToken: resetPasswordToken },
     updatedFields
   ).then(responses => {
     return res.json({
       result: "success",
       message: "Password update succesfully your can try login again"
     });
   });
 } else {
   return res.json({
     result: "error",
     message: "No Found Token"
   });
 }
});
router.get("/usuario/:id", async (req, res)=>{
  try {
    const usuario = await Users.findById(req.params.id);
    res.json(usuario);
  } catch (error) {
    
    console.log(error.response);
  }
})

router.put("/profile", async (req, res) => {
  try {
    var form = new formidable.IncomingForm();
    form.parse(req, async (err, fields, files) => {
      let doc = await Users.findOneAndUpdate({ _id: fields.id }, fields);
      await uploadImage(files, fields);
    res.json({ result: "success", message: "Update Successfully" });
    });
  } catch (err) {
    res.json({ result: "error", message: err.errmsg });
  }
});

module.exports = router;