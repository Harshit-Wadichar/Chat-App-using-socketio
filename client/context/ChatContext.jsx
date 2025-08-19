// ChatContext.jsx
import { createContext, useState, useEffect, useCallback, useRef, useContext } from "react";
import { AuthContext } from "./AuthContext";
import toast from "react-hot-toast";

export const ChatContext = createContext();

export const ChatProvider = ({ children }) => {
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [unseenMessages, setUnseenMessages] = useState({});

  const { socket, axios } = useContext(AuthContext);

  // keep a ref to the latest selectedUser so socket handler can access it without re-registering
  const selectedUserRef = useRef(selectedUser);
  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  // memoized: get users for sidebar (called once on mount)
  const getUsers = useCallback(async () => {
    try {
      // console.log("getUsers called");
      const { data } = await axios.get("/api/messages/users");
      if (data.success) {
        setUsers(data.users);
        setUnseenMessages(data.unseenMessages || {});
      }
    } catch (error) {
      console.error("getUsers error:", error);
      toast.error(error?.message || "Failed to fetch users");
    }
  }, [axios]);

  // memoized: get messages for selected user
  const getMessages = useCallback(
    async (userId) => {
      if (!userId) return;
      try {
        // console.log("getMessages called for", userId);
        const { data } = await axios.get(`/api/messages/${userId}`);
        if (data.success) {
          setMessages(data.messages || []);
        }
      } catch (error) {
        console.error("getMessages error:", error);
        toast.error(error?.message || "Failed to fetch messages");
      }
    },
    [axios]
  );

  // memoized: send message
  const sendMessage = useCallback(
    async (messageData) => {
      if (!selectedUser) {
        toast.error("No user selected");
        return;
      }
      try {
        const { data } = await axios.post(`/api/messages/send/${selectedUser._id}`, messageData);
        if (data.success) {
          setMessages((prev) => [...prev, data.newMessage]);
        } else {
          toast.error(data.message || "Failed to send message");
        }
      } catch (error) {
        console.error("sendMessage error:", error);
        toast.error(error?.message || "Failed to send message");
      }
    },
    [axios, selectedUser]
  );

  // register socket listener once per socket instance
  useEffect(() => {
    if (!socket) return;

    const handler = (newMessage) => {
      const sel = selectedUserRef.current;
      if (sel && newMessage.senderId === sel._id) {
        // message from currently selected user -> show and mark seen
        newMessage.seen = true;
        setMessages((prev) => [...prev, newMessage]);
        // mark seen on server (fire-and-forget)
        axios.put(`/api/messages/mark/${newMessage._id}`).catch((e) => console.error("mark seen error:", e.message));
      } else {
        // not the currently open chat -> increment unseen count
        setUnseenMessages((prev) => ({
          ...prev,
          [newMessage.senderId]: prev[newMessage.senderId] ? prev[newMessage.senderId] + 1 : 1,
        }));
      }
    };

    socket.on("newMessage", handler);

    return () => {
      socket.off("newMessage", handler);
    };
  }, [socket, axios]);

  // call getUsers once on mount
  useEffect(() => {
    getUsers();
  }, [getUsers]);

  const unsubscribeFromMessages = () => {
    if (socket) socket.off("newMessage");
  };

  const value = {
    messages,
    users,
    selectedUser,
    getUsers,
    getMessages,
    sendMessage,
    setSelectedUser,
    unseenMessages,
    setUnseenMessages,
    unsubscribeFromMessages,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};
