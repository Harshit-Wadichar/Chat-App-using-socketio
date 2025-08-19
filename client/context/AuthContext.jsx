// authContext.js
import { createContext, useState, useEffect } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { io as ioClient } from "socket.io-client";

const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
axios.defaults.baseURL = backendUrl;

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [authUser, setAuthUser] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [socket, setSocket] = useState(null);

  // Set axios auth header whenever token changes
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common["token"] = token;
    } else {
      delete axios.defaults.headers.common["token"];
    }
  }, [token]);

  // Check authentication on mount if token exists
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data } = await axios.get("/api/auth/check");
        if (data.success) {
          setAuthUser(data.user);
        } else {
          // invalid token or not authenticated
          setToken(null);
          localStorage.removeItem("token");
        }
      } catch (err) {
        console.log("checkAuth error:", err.message);
        // clear token on auth failure
        setToken(null);
        localStorage.removeItem("token");
      }
    };

    if (token) checkAuth();
  }, [token]);

  // Create socket when authUser becomes available; cleanup on logout/unmount
  useEffect(() => {
    if (!authUser) return;

    // Prevent creating a new socket if one already exists and is connected
    if (socket && socket.connected) return;

    const s = ioClient(backendUrl, {
      auth: { userId: authUser._id }, // use auth instead of query
      transports: ["websocket"], // avoid XHR polling fallback
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    // Optional logging
    s.on("connect", () => console.log("Socket connected", s.id));
    s.on("connect_error", (err) => console.log("Socket connect_error:", err.message));
    s.on("reconnect_attempt", (n) => console.log("Socket reconnect attempt:", n));

    s.on("getOnlineUsers", (userIds) => {
      setOnlineUsers(userIds);
    });

    setSocket(s);

    return () => {
      try {
        s.off("getOnlineUsers");
        s.disconnect();
        console.log("Socket disconnected (cleanup)");
      } catch (err) {
        // ignore
      }
      setSocket(null);
      setOnlineUsers([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser]); // intentionally only depend on authUser

  // Login: set token and authUser — socket will be created by effect above
  const login = async (state, credentials) => {
    try {
      const { data } = await axios.post(`/api/auth/${state}`, credentials);
      if (data.success) {
        axios.defaults.headers.common["token"] = data.token;
        setToken(data.token);
        localStorage.setItem("token", data.token);

        setAuthUser(data.userData); // this will trigger socket creation
        toast.success(data.message);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      toast.error(error.message);
    }
  };

  // Logout: disconnect socket and clear everything
  const logout = async () => {
    try {
      if (socket && socket.connected) {
        socket.disconnect();
        setSocket(null);
      }
    } catch (err) {
      console.log("socket disconnect error:", err.message);
    }

    localStorage.removeItem("token");
    setToken(null);
    setAuthUser(null);
    setOnlineUsers([]);
    delete axios.defaults.headers.common["token"];
    toast.success("Logged out successfully");
  };

  const updateProfile = async (body) => {
    try {
      const { data } = await axios.put("/api/auth/update-profile", body);
      if (data.success) {
        setAuthUser(data.user);
        toast.success("Profile updated successfully");
      }
    } catch (error) {
      toast.error(error.message);
    }
  };

  const value = {
    axios,
    authUser,
    onlineUsers,
    socket,
    login,
    logout,
    updateProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
