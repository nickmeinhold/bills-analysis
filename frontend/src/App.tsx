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
import Dashboard from "./Dashboard";

const BACKEND_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:8080"
    : "https://debt-dashboard-backend-km.a.run.app";

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
  const [needsReauth, setNeedsReauth] = useState(false);
  const [progress, setProgress] = useState<{
    message: string;
    current?: number;
    total?: number;
    subject?: string;
  } | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        const tokenDoc = await getDoc(doc(db, "gmail_tokens", user.uid));
        setGmailConnected(tokenDoc.exists());
        if (tokenDoc.exists()) {
          loadSavedBills(user.uid);
        }
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

  const disconnectGmail = async () => {
    if (!user) return;
    if (!window.confirm("Are you sure you want to disconnect Gmail?")) return;

    try {
      await fetch(`${BACKEND_URL}/gmail/disconnect?uid=${user.uid}`, {
        method: "POST",
      });
      setGmailConnected(false);
      setBills([]);
    } catch (err) {
      console.error("Error disconnecting Gmail:", err);
    }
  };

  const loadSavedBills = async (uid: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/bills?uid=${uid}`);
      const data = await res.json();
      if (data.bills?.length > 0) {
        setBills(data.bills);
      }
    } catch (err) {
      console.error("Error loading saved bills:", err);
    }
  };

  const analyzeBills = async () => {
    if (!user) return;
    setAnalyzing(true);
    setNeedsReauth(false);
    const foundBills: Bill[] = [];

    try {
      const eventSource = new EventSource(
        `${BACKEND_URL}/gmail/bills/analyze?uid=${user.uid}`
      );

      // Listen for progress events
      eventSource.addEventListener("progress", (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        const { stage, current, total } = data;

        let message = "";
        switch (stage) {
          case "parsing":
            message = "📥 Parsing emails from Gmail...";
            break;
          case "analyzing":
            message = "🤖 Analyzing bills with AI...";
            break;
          case "complete":
            message = `✓ Analyzing email ${current}/${total}`;
            break;
          default:
            message = `Processing ${current}/${total}...`;
        }

        setProgress({
          message,
          current,
          total,
        });
      });

      // Listen for bill events
      eventSource.addEventListener("bill", (event: MessageEvent) => {
        const bill: Bill = JSON.parse(event.data);
        foundBills.push(bill);
        setBills([...foundBills]); // Update bills in real-time
      });

      eventSource.onerror = (error) => {
        // EventSource fires onerror when stream ends naturally or on error
        // If we received data successfully, this is likely a normal close
        if (eventSource.readyState === EventSource.CLOSED) {
          console.log("Analysis complete, stream closed");
          setProgress({
            message: `✓ Complete! Found ${foundBills.length} bills`,
          });
          setTimeout(() => setProgress(null), 2000);
        } else {
          console.error("EventSource error:", error);
        }
        eventSource.close();
        setAnalyzing(false);
      };

      // Safety timeout to prevent hanging
      setTimeout(() => {
        if (eventSource.readyState !== EventSource.CLOSED) {
          console.warn("Analysis timeout, closing connection");
          eventSource.close();
          setAnalyzing(false);
          setProgress(null);
        }
      }, 120000); // 2 minute timeout
    } catch (err) {
      console.error("Error analyzing bills:", err);
      setAnalyzing(false);
      setProgress(null);
    }
  };

  const togglePaid = async (billId: string, currentStatus: string) => {
    if (!user) return;
    const newStatus = currentStatus === "paid" ? "unpaid" : "paid";

    try {
      await fetch(`${BACKEND_URL}/bills/${billId}/status?uid=${user.uid}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      setBills(
        bills.map((b) => (b.id === billId ? { ...b, status: newStatus } : b))
      );
    } catch (err) {
      console.error("Error updating bill:", err);
    }
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

  const getDueStatus = (dueDate: string | null, status: string) => {
    if (status === "paid") return "paid";
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

  const unpaidBills = bills.filter((b) => b.status !== "paid");
  const paidBills = bills.filter((b) => b.status === "paid");
  const totalDue = unpaidBills.reduce((sum, b) => sum + (b.amount || 0), 0);

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

          {needsReauth && (
            <div className="alert">
              Your Gmail connection expired. Please reconnect.
            </div>
          )}

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
                <div>
                  <button
                    onClick={analyzeBills}
                    className="btn primary"
                    disabled={analyzing}
                  >
                    {analyzing ? "Analyzing..." : "🔍 Scan for New Bills"}
                  </button>
                  <button
                    onClick={disconnectGmail}
                    className="btn secondary disconnect-btn"
                  >
                    Disconnect Gmail
                  </button>
                </div>
              </div>

              {analyzing && progress && (
                <div className="progress-bar">
                  <p className="progress-message">{progress.message}</p>
                  {progress.total && (
                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${
                            (progress.current! / progress.total) * 100
                          }%`,
                        }}
                      />
                      <span className="progress-text">
                        {progress.current} / {progress.total}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {bills.length > 0 && (
                <>
                  <div className="summary">
                    <div className="summary-card">
                      <span className="summary-label">Unpaid Bills</span>
                      <span className="summary-value">
                        {unpaidBills.length}
                      </span>
                    </div>
                    <div className="summary-card">
                      <span className="summary-label">Total Due</span>
                      <span className="summary-value">
                        ${totalDue.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {unpaidBills.length > 0 && (
                    <div className="bills">
                      <h2>Unpaid Bills</h2>
                      {unpaidBills.map((bill) => (
                        <div
                          key={bill.id}
                          className={`bill-card ${getDueStatus(
                            bill.dueDate,
                            bill.status
                          )}`}
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
                              {getDueStatus(bill.dueDate, bill.status) ===
                                "overdue" && (
                                <span className="badge overdue">Overdue</span>
                              )}
                              {getDueStatus(bill.dueDate, bill.status) ===
                                "due-soon" && (
                                <span className="badge due-soon">Due Soon</span>
                              )}
                            </div>
                          </div>
                          <div className="bill-actions">
                            <button
                              onClick={() => togglePaid(bill.id, bill.status)}
                              className="btn small success"
                            >
                              ✓ Mark Paid
                            </button>
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
                  )}

                  {paidBills.length > 0 && (
                    <div className="bills paid-section">
                      <h2>Paid Bills</h2>
                      {paidBills.map((bill) => (
                        <div key={bill.id} className="bill-card paid">
                          <div className="bill-header">
                            <span className="bill-company">
                              {bill.company || "Unknown"}
                            </span>
                            <span className="badge paid-badge">✓ Paid</span>
                          </div>
                          <div className="bill-details">
                            <div className="bill-amount">
                              {formatCurrency(bill.amount, bill.currency)}
                            </div>
                            <div className="bill-due">
                              Was due: {formatDate(bill.dueDate)}
                            </div>
                          </div>
                          <div className="bill-actions">
                            <button
                              onClick={() => togglePaid(bill.id, bill.status)}
                              className="btn small secondary"
                            >
                              Mark Unpaid
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {bills.length === 0 && !analyzing && (
                <p className="no-bills">
                  Click "Scan for New Bills" to analyze your inbox
                </p>
              )}
            </div>
          )}

          {gmailConnected && bills.length > 0 && <Dashboard bills={bills} />}

          <button onClick={handleLogout} className="btn secondary logout">
            Logout
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
