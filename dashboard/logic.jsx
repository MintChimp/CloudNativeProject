const { useEffect, useMemo, useRef, useState } = React;

function App() {
  const baseFuncUrl = "https://func-dietanalysis-lp-dev-g7f7g2b0e3gafghu.canadacentral-01.azurewebsites.net/api";
  
  // --- STATE ---
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')) || null);
  const [authMode, setAuthMode] = useState('login'); 
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [insights, setInsights] = useState({});
  const [metadata, setMetadata] = useState({});
  const [selectedDiet, setSelectedDiet] = useState("all");
  const [isLoading, setIsLoading] = useState(false);

  // --- REFS ---
  const barCanvasRef = useRef(null);
  const lineCanvasRef = useRef(null);
  const pieCanvasRef = useRef(null);
  const barChartRef = useRef(null);
  const lineChartRef = useRef(null);
  const pieChartRef = useRef(null);

  // --- AUTH FUNCTIONS ---
  const handleAuth = async () => {
    setIsLoading(true);
    try {
      const endpoint = authMode === 'login' ? `${baseFuncUrl}/login` : `${baseFuncUrl}/register`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name: email.split('@')[0] })
      });
      if (!response.ok) throw new Error(`${authMode} failed. Check credentials.`);
      const userData = await response.json();
      if (authMode === 'login') {
        localStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
      } else {
        alert("Registration successful! Please login.");
        setAuthMode('login');
      }
    } catch (err) { alert(err.message); } 
    finally { setIsLoading(false); }
  };

  const logout = () => {
    localStorage.removeItem('user');
    setUser(null);
  };

  // --- DATA FETCHING ---
  async function fetchData() {
    if (!user) return;
    setIsLoading(true);
    try {
      const response = await fetch(`${baseFuncUrl}/data_analysis`, { method: "GET" });
      if (!response.ok) throw new Error("Failed to fetch dashboard data");
      const payload = await response.json();
      setInsights(payload.insights || {});
      setMetadata(payload.metadata || {});
    } catch (err) { console.error(err.message); } 
    finally { setIsLoading(false); }
  }

  useEffect(() => { if (user) fetchData(); }, [user]);

  // --- MEMOIZED DATA ---
  const diets = useMemo(() => Object.keys(insights), [insights]);

  const chartData = useMemo(() => {
    const labels = selectedDiet === "all" ? diets : diets.filter((d) => d === selectedDiet);
    return {
      labels,
      protein: labels.map((d) => Number(insights[d]?.["Protein(g)"] ?? 0)),
      carbs: labels.map((d) => Number(insights[d]?.["Carbs(g)"] ?? 0)),
      fat: labels.map((d) => Number(insights[d]?.["Fat(g)"] ?? 0))
    };
  }, [diets, insights, selectedDiet]);

  const pieData = useMemo(() => {
    if (!chartData.labels.length) return { labels: ["N/A"], values: [0], title: "No Data" };
    if (selectedDiet === "all") {
      return {
        labels: chartData.labels,
        values: chartData.labels.map((_, i) => chartData.protein[i] + chartData.carbs[i] + chartData.fat[i]),
        title: "Total Macro Share by Diet"
      };
    }
    return {
      labels: ["Protein(g)", "Carbs(g)", "Fat(g)"],
      values: [chartData.protein[0], chartData.carbs[0], chartData.fat[0]],
      title: `Macro Split: ${chartData.labels[0]}`
    };
  }, [chartData, selectedDiet]);

  // --- CHART EFFECTS ---

  // Bar Chart
  useEffect(() => {
    if (!user || !barCanvasRef.current || !chartData.labels.length) return;
    if (barChartRef.current) barChartRef.current.destroy();
    barChartRef.current = new Chart(barCanvasRef.current, {
      type: "bar",
      data: {
        labels: chartData.labels,
        datasets: [
          { label: "Protein(g)", data: chartData.protein, backgroundColor: '#4bc0c0' },
          { label: "Carbs(g)", data: chartData.carbs, backgroundColor: '#36a2eb' },
          { label: "Fat(g)", data: chartData.fat, backgroundColor: '#ff6384' }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
    return () => barChartRef.current?.destroy();
  }, [chartData, user]);

  // Line Chart
  useEffect(() => {
    if (!user || !lineCanvasRef.current || !chartData.labels.length) return;
    if (lineChartRef.current) lineChartRef.current.destroy();
    lineChartRef.current = new Chart(lineCanvasRef.current, {
      type: "line",
      data: {
        labels: chartData.labels,
        datasets: [
          { label: "Protein(g)", data: chartData.protein, borderColor: '#4bc0c0', tension: 0.3 },
          { label: "Carbs(g)", data: chartData.carbs, borderColor: '#36a2eb', tension: 0.3 },
          { label: "Fat(g)", data: chartData.fat, borderColor: '#ff6384', tension: 0.3 }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
    return () => lineChartRef.current?.destroy();
  }, [chartData, user]);

  // Pie Chart
  useEffect(() => {
    if (!user || !pieCanvasRef.current || !chartData.labels.length) return;
    if (pieChartRef.current) pieChartRef.current.destroy();
    pieChartRef.current = new Chart(pieCanvasRef.current, {
      type: "pie",
      data: {
        labels: pieData.labels,
        datasets: [{ data: pieData.values, backgroundColor: ['#4bc0c0', '#36a2eb', '#ff6384', '#ffcd56', '#9966ff'] }]
      },
      options: { 
        responsive: true, 
        maintainAspectRatio: false,
        plugins: { title: { display: true, text: pieData.title } }
      }
    });
    return () => pieChartRef.current?.destroy();
  }, [chartData, pieData, user]);

  // --- UI RENDER ---

  if (!user) {
    return (
      <main className="container auth-screen">
        <section className="chart-card auth-box" style={{ maxWidth: '400px', margin: '100px auto', padding: '2rem' }}>
          <h2 style={{ textAlign: 'center' }}>{authMode === 'login' ? 'Cloud Dashboard Login' : 'Register Account'}</h2>
          <div className="control-group" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button onClick={handleAuth} disabled={isLoading}>{isLoading ? "Wait..." : authMode.toUpperCase()}</button>
          </div>
          <p onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} style={{ cursor: 'pointer', textAlign: 'center', marginTop: '15px', color: '#36a2eb' }}>
            {authMode === 'login' ? "New here? Create account" : "Already have an account? Login"}
          </p>
          <hr style={{ margin: '20px 0' }} />
          <button className="secondary" style={{ width: '100%' }} onClick={() => window.location.href='/.auth/login/github'}>
            Login with GitHub (OAuth)
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="container">
      <header className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 0' }}>
        <h1>Diet Analysis Dashboard</h1>
        <div style={{ textAlign: 'right' }}>
          <span>Welcome, <b>{user.name}</b></span><br/>
          <button onClick={logout} style={{ background: '#ff6384', padding: '5px 10px', fontSize: '0.8rem' }}>Logout</button>
        </div>
      </header>

      <section className="controls">
        <div className="control-group">
          <label>Filter Diet:</label>
          <select value={selectedDiet} onChange={(e) => setSelectedDiet(e.target.value)}>
            <option value="all">All Diets</option>
            {diets.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <button onClick={fetchData} disabled={isLoading}>Refresh</button>
      </section>

      <section className="meta">
        <article className="meta-card">
          <h4>Execution Status</h4>
          <p>{metadata.status || "Authenticated"}</p>
          <small>Time: {metadata.execution_time || "Cached"}</small>
        </article>
      </section>

      <section className="charts" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
        <article className="chart-card" style={{ height: '400px' }}>
          <h3>Averages (Bar)</h3>
          <canvas ref={barCanvasRef}></canvas>
        </article>
        <article className="chart-card" style={{ height: '400px' }}>
          <h3>Trends (Line)</h3>
          <canvas ref={lineCanvasRef}></canvas>
        </article>
        <article className="chart-card" style={{ height: '400px' }}>
          <h3>Distribution (Pie)</h3>
          <canvas ref={pieCanvasRef}></canvas>
        </article>
      </section>
    </main>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);