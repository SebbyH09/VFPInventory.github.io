function requireAuth(req, res, next) {
    if (req.session && req.session.isLoggedIn) {
        next(); // User is authenticated, proceed
    } else {
        res.redirect('/login'); // Not authenticated, redirect to login
    }
}

module.exports = requireAuth;