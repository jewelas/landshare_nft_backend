const mongoose = require('mongoose');
const passport = require('passport');
const config = require('../config/database');
require('../config/passport')(passport);
const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const User = require("../models/user");

router.post('/register', function (req, res) {
    if (!req.body.username || !req.body.password) {
        res.json({ success: false, msg: 'Please pass username and password.' });
    } else {
        var newUser = new User({
            username: req.body.username.toLowerCase(),
            password: req.body.password
        });
        // save the user
        newUser.save(function (err) {
            if (err) {
                return res.json({ success: false, msg: 'Username already exists.' });
            }
            res.json({ success: true, msg: 'Successful created new user.' });
        });
    }
});

router.post('/signin', function (req, res) {
    User.findOne({
        username: req.body.username.toLowerCase()
    }, function (err, user) {
        if (err) throw err;

        if (!user) {
            res.status(401).send({ success: false, msg: 'Authentication failed. User not found.' });
        } else {
            // check if password matches
            user.comparePassword(req.body.password, function (err, isMatch) {
                if (isMatch && !err) {
                    // if user is found and password is right create a token
                    var token = jwt.sign(user.toJSON(), config.secret, {
                        expiresIn: 604800 // 1 week
                    });
                    // return the information including token as JSON
                    res.json({ success: true, token: 'JWT ' + token });
                } else {
                    res.status(401).send({ success: false, msg: 'Authentication failed. Wrong password.' });
                }
            });
        }
    });
});

router.get('/signout', passport.authenticate('jwt', { session: false }), function (req, res) {
    req.logout();
    res.json({ success: true, msg: 'Sign out successfully.' });
});

module.exports = router;