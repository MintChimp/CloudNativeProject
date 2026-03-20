const { useEffect, useMemo, useRef, useState } = React;

function App() {
  const apiUrl = window.DASHBOARD_CONFIG?.apiUrl || "/api/data_analysis";
  const [insights, setInsights] = useState({});
  const [metadata, setMetadata] = useState({});
  const [selectedDiet, setSelectedDiet] = useState("all");
  const [isLoading, setIsLoading] = useState(false);

  const barCanvasRef = useRef(null);
  const lineCanvasRef = useRef(null);
  const pieCanvasRef = useRef(null);

  const barChartRef = useRef(null);
  const lineChartRef = useRef(null);
  const pieChartRef = useRef(null);

  const diets = useMemo(() => Object.keys(insights), [insights]);

  const chartData = useMemo(() => {
    const labels = diets;
    const protein = labels.map((diet) => Number(insights[diet]?.["Protein(g)"] ?? 0));
    const carbs = labels.map((diet) => Number(insights[diet]?.["Carbs(g)"] ?? 0));
    const fat = labels.map((diet) => Number(insights[diet]?.["Fat(g)"] ?? 0));
    return { labels, protein, carbs, fat };
  }, [diets, insights]);

  const pieData = useMemo(() => {
    if (!chartData.labels.length) {
      return { diet: "N/A", values: [0, 0, 0] };
    }

    const activeDiet = selectedDiet === "all" ? chartData.labels[0] : selectedDiet;
    const index = chartData.labels.indexOf(activeDiet);

    return {
      diet: activeDiet,
      values: [
        chartData.protein[index] ?? 0,
        chartData.carbs[index] ?? 0,
        chartData.fat[index] ?? 0
      ]
    };
  }, [chartData, selectedDiet]);

  async function fetchData() {
    try {
      const endpoint = apiUrl.trim() || "/api/data_analysis";

      setIsLoading(true);
      const response = await fetch(endpoint, { method: "GET" });

      if (!response.ok) {
        throw new Error(`Function request failed (${response.status}).`);
      }

      const payload = await response.json();
      if (!payload || typeof payload !== "object" || !payload.insights) {
        throw new Error("Unexpected response format. Expected { insights, metadata }.");
      }

      setInsights(payload.insights);
      setMetadata(payload.metadata || {});
      setSelectedDiet("all");
    } catch (err) {
      console.error(err.message || "Unable to load dashboard data.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!barCanvasRef.current || !chartData.labels.length) {
      return;
    }

    if (barChartRef.current) {
      barChartRef.current.destroy();
    }

    barChartRef.current = new Chart(barCanvasRef.current, {
      type: "bar",
      data: {
        labels: chartData.labels,
        datasets: [
          { label: "Protein(g)", data: chartData.protein },
          { label: "Carbs(g)", data: chartData.carbs },
          { label: "Fat(g)", data: chartData.fat }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false
      }
    });

    return () => {
      if (barChartRef.current) {
        barChartRef.current.destroy();
      }
    };
  }, [chartData]);

  useEffect(() => {
    if (!lineCanvasRef.current || !chartData.labels.length) {
      return;
    }

    if (lineChartRef.current) {
      lineChartRef.current.destroy();
    }

    lineChartRef.current = new Chart(lineCanvasRef.current, {
      type: "line",
      data: {
        labels: chartData.labels,
        datasets: [
          { label: "Protein(g)", data: chartData.protein, tension: 0.25 },
          { label: "Carbs(g)", data: chartData.carbs, tension: 0.25 },
          { label: "Fat(g)", data: chartData.fat, tension: 0.25 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false
      }
    });

    return () => {
      if (lineChartRef.current) {
        lineChartRef.current.destroy();
      }
    };
  }, [chartData]);

  useEffect(() => {
    if (!pieCanvasRef.current || !chartData.labels.length) {
      return;
    }

    if (pieChartRef.current) {
      pieChartRef.current.destroy();
    }

    pieChartRef.current = new Chart(pieCanvasRef.current, {
      type: "pie",
      data: {
        labels: ["Protein(g)", "Carbs(g)", "Fat(g)"],
        datasets: [
          {
            label: `${pieData.diet} Macro Split`,
            data: pieData.values
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: `Diet Type: ${pieData.diet}`
          }
        }
      }
    });

    return () => {
      if (pieChartRef.current) {
        pieChartRef.current.destroy();
      }
    };
  }, [chartData, pieData]);

  return (
    <main className="container">
      <header className="header">
        <h1>Diet Analysis Cloud Dashboard</h1>
      </header>

      <section className="controls" aria-label="Dashboard controls">
        <div className="control-group">
          <label htmlFor="dietFilter">Diet filter</label>
          <select
            id="dietFilter"
            value={selectedDiet}
            onChange={(event) => setSelectedDiet(event.target.value)}
          >
            <option value="all">All Diet Types</option>
            {diets.map((diet) => (
              <option key={diet} value={diet}>
                {diet}
              </option>
            ))}
          </select>
        </div>

        <div className="control-group">
          <button type="button" disabled={isLoading} onClick={fetchData}>
            {isLoading ? "Loading..." : "Refresh Data"}
          </button>
        </div>
      </section>

      <section className="meta" aria-label="Function metadata">
        <article className="meta-card">
          <h2>Execution Time</h2>
          <p>{metadata.execution_time || "-"}</p>
        </article>
      </section>

      <section className="charts">
        <article className="chart-card">
          <h2>Average Macros by Diet Type (Bar)</h2>
          <canvas ref={barCanvasRef} aria-label="Bar chart"></canvas>
        </article>

        <article className="chart-card">
          <h2>Macro Trends Across Diet Types (Line)</h2>
          <canvas ref={lineCanvasRef} aria-label="Line chart"></canvas>
        </article>

        <article className="chart-card">
          <h2>Macro Split for Selected Diet (Pie)</h2>
          <canvas ref={pieCanvasRef} aria-label="Pie chart"></canvas>
        </article>
      </section>
    </main>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
