import { useState, useEffect } from "react";
import "./App.css";
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, googleProvider, db } from "./firebase";

const BACKEND_URL = "https://node-backend-wys33etura-km.a.run.app";

interface Bill {
  id: string;
  emailSubject: string;
  emailFrom: string;
  emailDate: string;
  isBill: boolean;
  company: string | null;
  amount: number | null;
  currency: string | null;
  dueDate: string | null;
  billType: string | null;
  status: string;
  confidence: number;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        const tokenDoc = await getDoc(doc(db, "gmail_tokens", user.uid));
        setGmailConnected(tokenDoc.exists());
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Login error:", err);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setGmailConnected(false);
    setBills([]);
  };

  // Safe OAuth popup handling
  const connectGmail = () => {
    if (!user) return;
    const popup = window.open(
      `${BACKEND_URL}/gmail/auth?uid=${user.uid}`,
      "oauth",
      "width=500,height=600"
    );
    // Listen for message from popup
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data === "oauth-success") {
        setGmailConnected(true);
        if (popup) popup.close();
        window.removeEventListener("message", handler);
      }
    };
    window.addEventListener("message", handler);
  };
  // Listen for OAuth success message on mount (in case popup sends after reload)
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data === "oauth-success") {
        setGmailConnected(true);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const analyzeBills = async () => {
    if (!user) return;
    setAnalyzing(true);
    try {
      const res = await fetch(
        `${BACKEND_URL}/gmail/bills/analyze?uid=${user.uid}`
      );
      const data = await res.json();
      setBills(data.bills || []);
    } catch (err) {
      console.error("Error analyzing bills:", err);
    }
    setAnalyzing(false);
  };

  const formatCurrency = (amount: number | null, currency: string | null) => {
    if (amount === null) return "—";
    return `${currency || "$"}${amount.toFixed(2)}`;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const getDueStatus = (dueDate: string | null) => {
    if (!dueDate) return "unknown";
    const due = new Date(dueDate);
    const today = new Date();
    const diffDays = Math.ceil(
      (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays < 0) return "overdue";
    if (diffDays <= 7) return "due-soon";
    return "upcoming";
  };

  const totalDue = bills
    .filter((b) => b.status !== "paid")
    .reduce((sum, b) => sum + (b.amount || 0), 0);

  if (loading) return <div className="container">Loading...</div>;

  return (
    <div className="container">
      <h1>💰 Bill Tracker</h1>

      {!user ? (
        <button onClick={handleLogin} className="btn primary">
          Sign in with Google
        </button>
      ) : (
        <div>
          <p className="welcome">Welcome, {user.displayName}!</p>

          {!gmailConnected ? (
            <div className="connect-section">
              <p>Connect your Gmail to scan for bills:</p>
              <button onClick={connectGmail} className="btn primary">
                Connect Gmail
              </button>
            </div>
          ) : (
            <div>
              <div className="status-bar">
                <span className="connected">✅ Gmail connected</span>
                <button
                  onClick={analyzeBills}
                  className="btn primary"
                  disabled={analyzing}
                >
                  {analyzing ? "Analyzing..." : "🔍 Analyze Bills"}
                </button>
              </div>

              {bills.length > 0 && (
                <>
                  <div className="summary">
                    <div className="summary-card">
                      <span className="summary-label">Bills Found</span>
                      <span className="summary-value">{bills.length}</span>
                    </div>
                    <div className="summary-card">
                      <span className="summary-label">Total Due</span>
                      <span className="summary-value">
                        ${totalDue.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="bills">
                    <h2>Your Bills</h2>
                    {bills.map((bill) => (
                      <div
                        key={bill.id}
                        className={`bill-card ${getDueStatus(bill.dueDate)}`}
                      >
                        <div className="bill-header">
                          <span className="bill-company">
                            {bill.company || "Unknown"}
                          </span>
                          <span className={`bill-type ${bill.billType}`}>
                            {bill.billType || "other"}
                          </span>
                        </div>
                        <div className="bill-details">
                          <div className="bill-amount">
                            {formatCurrency(bill.amount, bill.currency)}
                          </div>
                          <div className="bill-due">
                            Due: {formatDate(bill.dueDate)}
                            {getDueStatus(bill.dueDate) === "overdue" && (
                              <span className="badge overdue">Overdue</span>
                            )}
                            {getDueStatus(bill.dueDate) === "due-soon" && (
                              <span className="badge due-soon">Due Soon</span>
                            )}
                          </div>
                        </div>
                        <div className="bill-meta">
                          <span className="bill-subject">
                            {bill.emailSubject}
                          </span>
                          <span className="bill-confidence">
                            {bill.confidence}% confidence
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {bills.length === 0 && !analyzing && (
                <p className="no-bills">
                  Click "Analyze Bills" to scan your inbox
                </p>
              )}
            </div>
          )}

          <button onClick={handleLogout} className="btn secondary logout">
            Logout
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
