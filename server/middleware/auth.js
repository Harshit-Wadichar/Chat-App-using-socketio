import User from "../models/User.js";
import jwt from "jsonwebtoken";

// Middleware to protect routes
export const protectRoute = async (req, res, next) => {
  try {
    const token = req.headers.token;

    if (!token) {
      return res.json({ success: false, message: "Access denied. No token provided." });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    req.user = user; // Attach user to request for downstream access
    next();
  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: "Invalid or expired token" });
  }
};