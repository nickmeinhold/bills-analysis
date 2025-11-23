import { useMemo } from "react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import "./Dashboard.css";

interface Bill {
  id: string;
  company: string | null;
  amount: number | null;
  currency: string | null;
  dueDate: string | null;
  billType: string | null;
  status: string;
}

interface DashboardProps {
  bills: Bill[];
}

const COLORS = {
  electricity: "#ffc107",
  internet: "#2196f3",
  phone: "#4caf50",
  insurance: "#f44336",
  subscription: "#9c27b0",
  other: "#757575",
};

export default function Dashboard({ bills }: DashboardProps) {
  // Category spending
  const categoryData = useMemo(() => {
    const categories: Record<string, number> = {};
    bills.forEach((bill) => {
      if (bill.amount) {
        const type = bill.billType || "other";
        categories[type] = (categories[type] || 0) + bill.amount;
      }
    });
    return Object.entries(categories).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value: Math.round(value * 100) / 100,
      color: COLORS[name as keyof typeof COLORS] || COLORS.other,
    }));
  }, [bills]);

  // Monthly spending trend
  const monthlyData = useMemo(() => {
    const months: Record<string, number> = {};
    bills.forEach((bill) => {
      if (bill.dueDate && bill.amount) {
        const month = new Date(bill.dueDate).toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
        });
        months[month] = (months[month] || 0) + bill.amount;
      }
    });
    return Object.entries(months)
      .map(([month, total]) => ({
        month,
        total: Math.round(total * 100) / 100,
      }))
      .slice(-6); // Last 6 months
  }, [bills]);

  // Top merchants
  const merchantData = useMemo(() => {
    const merchants: Record<string, number> = {};
    bills.forEach((bill) => {
      if (bill.amount && bill.company) {
        merchants[bill.company] = (merchants[bill.company] || 0) + bill.amount;
      }
    });
    return Object.entries(merchants)
      .map(([name, total]) => ({
        name,
        total: Math.round(total * 100) / 100,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [bills]);

  // Stats
  const stats = useMemo(() => {
    const unpaidBills = bills.filter((b) => b.status !== "paid");
    const totalDue = unpaidBills.reduce((sum, b) => sum + (b.amount || 0), 0);
    const avgBill =
      bills.length > 0
        ? bills.reduce((sum, b) => sum + (b.amount || 0), 0) / bills.length
        : 0;
    const totalSpent = bills
      .filter((b) => b.status === "paid")
      .reduce((sum, b) => sum + (b.amount || 0), 0);

    return {
      totalBills: bills.length,
      unpaidBills: unpaidBills.length,
      totalDue: Math.round(totalDue * 100) / 100,
      avgBill: Math.round(avgBill * 100) / 100,
      totalSpent: Math.round(totalSpent * 100) / 100,
    };
  }, [bills]);

  if (bills.length === 0) {
    return (
      <div className="dashboard-empty">
        <p>No bills to analyze yet. Scan your Gmail to get started!</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <h2>📊 Bill Analytics</h2>

      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">Total Bills</span>
          <span className="stat-value">{stats.totalBills}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Unpaid</span>
          <span className="stat-value warning">{stats.unpaidBills}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total Due</span>
          <span className="stat-value">${stats.totalDue}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Avg Bill</span>
          <span className="stat-value">${stats.avgBill}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total Spent</span>
          <span className="stat-value success">${stats.totalSpent}</span>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <h3>Spending by Category</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={categoryData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(entry) => `${entry.name}: $${entry.value}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {categoryData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>Monthly Spending Trend</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="total"
                stroke="#667eea"
                strokeWidth={2}
                name="Total ($)"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>Top 5 Merchants</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={merchantData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={100} />
              <Tooltip />
              <Bar dataKey="total" fill="#667eea" name="Total ($)" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>Category Breakdown</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={categoryData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" name="Total ($)">
                {categoryData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
