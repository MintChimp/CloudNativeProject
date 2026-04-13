const { useEffect, useMemo, useRef, useState, useCallback } = React;

function App() {
  const baseFuncUrl =
    (window.DASHBOARD_CONFIG && window.DASHBOARD_CONFIG.apiUrl) ||
    "https://func-dietanalysis-lp-dev-g7f7g2b0e3gafghu.canadacentral-01.azurewebsites.net/api";

  // --- STATE ---
  const [user, setUser] = useState(JSON.parse(localStorage.getItem("user")) || null);
  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Dashboard data
  const [insights, setInsights] = useState({});
  const [metadata, setMetadata] = useState({});
  const [selectedDiet, setSelectedDiet] = useState("all");
  const [searchKeyword, setSearchKeyword] = useState("");

  // Recipes / pagination
  const [recipes, setRecipes] = useState([]);
  const [recipePage, setRecipePage] = useState(1);
  const [recipeTotalPages, setRecipeTotalPages] = useState(1);
  const [recipeTotalResults, setRecipeTotalResults] = useState(0);
  const [recipesLoading, setRecipesLoading] = useState(false);

  // 2FA placeholder
  const [twoFaCode, setTwoFaCode] = useState("");

  // --- REFS ---
  const barCanvasRef = useRef(null);
  const scatterCanvasRef = useRef(null);
  const pieCanvasRef = useRef(null);
  const barChartRef = useRef(null);
  const scatterChartRef = useRef(null);
  const pieChartRef = useRef(null);

  // ============================
  //  AUTH
  // ============================
  const handleAuth = async () => {
    setIsLoading(true);
    try {
      const endpoint = authMode === "login" ? `${baseFuncUrl}/login` : `${baseFuncUrl}/register`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name: email.split("@")[0] }),
      });
      if (!response.ok) throw new Error(`${authMode} failed. Check credentials.`);
      const data = await response.json();
      if (authMode === "login") {
        const userData = data.user || data;
        localStorage.setItem("user", JSON.stringify(userData));
        setUser(userData);
      } else {
        alert("Registration successful! Please login.");
        setAuthMode("login");
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("user");
    setUser(null);
  };

  // ============================
  //  DATA FETCHING
  // ============================
  const fetchInsights = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${baseFuncUrl}/data_analysis`, { method: "GET" });
      if (!res.ok) throw new Error("Failed to fetch dashboard data");
      const payload = await res.json();
      setInsights(payload.insights || {});
      setMetadata(payload.metadata || {});
    } catch (err) {
      console.error(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [user, baseFuncUrl]);

  const fetchRecipes = useCallback(
    async (page) => {
      if (!user) return;
      setRecipesLoading(true);
      try {
        const params = new URLSearchParams();
        if (selectedDiet && selectedDiet !== "all") params.set("diet", selectedDiet);
        if (searchKeyword) params.set("keyword", searchKeyword);
        params.set("page", page);
        const res = await fetch(`${baseFuncUrl}/recipes/search?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch recipes");
        const data = await res.json();
        setRecipes(data.results || []);
        setRecipePage(data.page || page);
        setRecipeTotalPages(data.total_pages || 1);
        setRecipeTotalResults(data.total_results || 0);
      } catch (err) {
        console.error(err.message);
      } finally {
        setRecipesLoading(false);
      }
    },
    [user, baseFuncUrl, selectedDiet, searchKeyword]
  );

  // Load data on login
  useEffect(() => {
    if (user) fetchInsights();
  }, [user, fetchInsights]);

  // ============================
  //  MEMOIZED CHART DATA
  // ============================
  const diets = useMemo(() => Object.keys(insights), [insights]);

  const chartData = useMemo(() => {
    const labels = selectedDiet === "all" ? diets : diets.filter((d) => d === selectedDiet);
    return {
      labels,
      protein: labels.map((d) => Number(insights[d]?.["Protein(g)"] ?? 0)),
      carbs: labels.map((d) => Number(insights[d]?.["Carbs(g)"] ?? 0)),
      fat: labels.map((d) => Number(insights[d]?.["Fat(g)"] ?? 0)),
    };
  }, [diets, insights, selectedDiet]);

  const pieData = useMemo(() => {
    if (!chartData.labels.length) return { labels: ["N/A"], values: [0], title: "No Data" };
    if (selectedDiet === "all") {
      return {
        labels: chartData.labels,
        values: chartData.labels.map(
          (_, i) => chartData.protein[i] + chartData.carbs[i] + chartData.fat[i]
        ),
        title: "Recipe Distribution by Diet Type",
      };
    }
    return {
      labels: ["Protein(g)", "Carbs(g)", "Fat(g)"],
      values: [chartData.protein[0], chartData.carbs[0], chartData.fat[0]],
      title: `Macro Split: ${chartData.labels[0]}`,
    };
  }, [chartData, selectedDiet]);

  // ============================
  //  HEATMAP DATA
  // ============================
  const heatmapData = useMemo(() => {
    const nutrients = ["Protein(g)", "Carbs(g)", "Fat(g)"];
    if (!chartData.labels.length) return null;
    // Build a mini correlation-like matrix from averages
    const rows = nutrients.map((rowN, ri) => {
      return nutrients.map((colN, ci) => {
        if (ri === ci) return 1;
        // Approximate correlation using the means per diet
        const a = chartData.labels.map((d) => Number(insights[d]?.[rowN] ?? 0));
        const b = chartData.labels.map((d) => Number(insights[d]?.[colN] ?? 0));
        const n = a.length;
        if (n < 2) return 0;
        const ma = a.reduce((s, v) => s + v, 0) / n;
        const mb = b.reduce((s, v) => s + v, 0) / n;
        const cov = a.reduce((s, v, i) => s + (v - ma) * (b[i] - mb), 0) / (n - 1);
        const sa = Math.sqrt(a.reduce((s, v) => s + (v - ma) ** 2, 0) / (n - 1)) || 1;
        const sb = Math.sqrt(b.reduce((s, v) => s + (v - mb) ** 2, 0) / (n - 1)) || 1;
        return +(cov / (sa * sb)).toFixed(2);
      });
    });
    return { nutrients, rows };
  }, [chartData, insights]);

  // ============================
  //  CHART EFFECTS
  // ============================

  // Bar Chart — Average macronutrient content by diet type
  useEffect(() => {
    if (!user || !barCanvasRef.current || !chartData.labels.length) return;
    if (barChartRef.current) barChartRef.current.destroy();
    barChartRef.current = new Chart(barCanvasRef.current, {
      type: "bar",
      data: {
        labels: chartData.labels,
        datasets: [
          { label: "Protein(g)", data: chartData.protein, backgroundColor: "#4bc0c0" },
          { label: "Carbs(g)", data: chartData.carbs, backgroundColor: "#36a2eb" },
          { label: "Fat(g)", data: chartData.fat, backgroundColor: "#ff6384" },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false },
    });
    return () => barChartRef.current?.destroy();
  }, [chartData, user]);

  // Scatter Plot — Protein vs Carbs
  useEffect(() => {
    if (!user || !scatterCanvasRef.current || !chartData.labels.length) return;
    if (scatterChartRef.current) scatterChartRef.current.destroy();
    const points = chartData.labels.map((_, i) => ({
      x: chartData.protein[i],
      y: chartData.carbs[i],
    }));
    scatterChartRef.current = new Chart(scatterCanvasRef.current, {
      type: "scatter",
      data: {
        datasets: [
          {
            label: "Protein vs Carbs",
            data: points,
            backgroundColor: "#36a2eb",
            pointRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { title: { display: true, text: "Protein(g)" } },
          y: { title: { display: true, text: "Carbs(g)" } },
        },
      },
    });
    return () => scatterChartRef.current?.destroy();
  }, [chartData, user]);

  // Pie Chart — Recipe distribution by diet type
  useEffect(() => {
    if (!user || !pieCanvasRef.current || !chartData.labels.length) return;
    if (pieChartRef.current) pieChartRef.current.destroy();
    pieChartRef.current = new Chart(pieCanvasRef.current, {
      type: "pie",
      data: {
        labels: pieData.labels,
        datasets: [
          {
            data: pieData.values,
            backgroundColor: ["#4bc0c0", "#36a2eb", "#ff6384", "#ffcd56", "#9966ff", "#ff9f40"],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { title: { display: true, text: pieData.title } },
      },
    });
    return () => pieChartRef.current?.destroy();
  }, [chartData, pieData, user]);

  // ============================
  //  PAGINATION HELPERS
  // ============================
  const goToPage = (p) => {
    if (p < 1 || p > recipeTotalPages) return;
    fetchRecipes(p);
  };

  const pageNumbers = useMemo(() => {
    const pages = [];
    const maxShow = 5;
    let start = Math.max(1, recipePage - Math.floor(maxShow / 2));
    let end = Math.min(recipeTotalPages, start + maxShow - 1);
    if (end - start + 1 < maxShow) start = Math.max(1, end - maxShow + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }, [recipePage, recipeTotalPages]);

  // ============================
  //  HEATMAP COLOR
  // ============================
  const heatColor = (v) => {
    // -1..1 => red..green
    const t = (v + 1) / 2; // 0..1
    const r = Math.round(255 * (1 - t));
    const g = Math.round(200 * t);
    const b = 80;
    return `rgb(${r},${g},${b})`;
  };

  // ============================
  //  RENDER: LOGIN SCREEN
  // ============================
  if (!user) {
    return React.createElement(
      "div",
      { className: "bg-gray-100 min-h-screen auth-screen" },
      React.createElement(
        "div",
        { className: "auth-box" },
        React.createElement(
          "h2",
          { className: "text-2xl font-semibold text-center mb-4" },
          authMode === "login" ? "Nutritional Insights Login" : "Create Account"
        ),
        React.createElement("input", {
          type: "email",
          placeholder: "Email",
          value: email,
          onChange: (e) => setEmail(e.target.value),
        }),
        React.createElement("input", {
          type: "password",
          placeholder: "Password",
          value: password,
          onChange: (e) => setPassword(e.target.value),
        }),
        React.createElement(
          "button",
          { className: "primary", onClick: handleAuth, disabled: isLoading },
          isLoading ? "Please wait..." : authMode === "login" ? "Login" : "Register"
        ),
        React.createElement(
          "p",
          {
            className: "text-center mt-3 text-blue-600 cursor-pointer text-sm",
            onClick: () => setAuthMode(authMode === "login" ? "register" : "login"),
          },
          authMode === "login" ? "New here? Create account" : "Already have an account? Login"
        ),
        React.createElement("hr", { className: "my-4" }),
        React.createElement(
          "button",
          {
            className: "github",
            onClick: () => (window.location.href = "/.auth/login/github"),
          },
          "Login with GitHub"
        )
      )
    );
  }

  // ============================
  //  RENDER: DASHBOARD
  // ============================
  return React.createElement(
    "div",
    { className: "bg-gray-100 min-h-screen" },

    // ── HEADER ──
    React.createElement(
      "header",
      { className: "bg-blue-600 p-4 text-white flex justify-between items-center" },
      React.createElement("h1", { className: "text-3xl font-semibold" }, "Nutritional Insights"),
      React.createElement(
        "div",
        { className: "text-right" },
        React.createElement(
          "span",
          { className: "block text-sm" },
          "Welcome, ",
          React.createElement("b", null, user.name || user.email || "User")
        ),
        React.createElement(
          "button",
          {
            className: "mt-1 bg-red-500 hover:bg-red-600 text-white text-xs py-1 px-3 rounded",
            onClick: logout,
          },
          "Logout"
        )
      )
    ),

    // ── MAIN ──
    React.createElement(
      "main",
      { className: "container mx-auto p-6" },

      // ── EXPLORE NUTRITIONAL INSIGHTS (4 charts) ──
      React.createElement(
        "section",
        { className: "mb-8" },
        React.createElement("h2", { className: "text-2xl font-semibold mb-4" }, "Explore Nutritional Insights"),
        isLoading && React.createElement("p", { className: "text-sm text-gray-500 mb-2" }, "Loading data..."),
        React.createElement(
          "div",
          { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" },

          // Bar Chart
          React.createElement(
            "div",
            { className: "bg-white p-4 shadow-lg rounded-lg" },
            React.createElement("h3", { className: "font-semibold" }, "Bar Chart"),
            React.createElement("p", { className: "text-sm text-gray-600" }, "Average macronutrient content by diet type."),
            React.createElement("div", { style: { height: "192px" } }, React.createElement("canvas", { ref: barCanvasRef }))
          ),

          // Scatter Plot
          React.createElement(
            "div",
            { className: "bg-white p-4 shadow-lg rounded-lg" },
            React.createElement("h3", { className: "font-semibold" }, "Scatter Plot"),
            React.createElement("p", { className: "text-sm text-gray-600" }, "Nutrient relationships (e.g., protein vs carbs)."),
            React.createElement("div", { style: { height: "192px" } }, React.createElement("canvas", { ref: scatterCanvasRef }))
          ),

          // Heatmap
          React.createElement(
            "div",
            { className: "bg-white p-4 shadow-lg rounded-lg" },
            React.createElement("h3", { className: "font-semibold" }, "Heatmap"),
            React.createElement("p", { className: "text-sm text-gray-600" }, "Nutrient correlations."),
            React.createElement(
              "div",
              { style: { height: "192px" } },
              heatmapData
                ? React.createElement(
                    "div",
                    {
                      className: "heatmap-grid",
                      style: { gridTemplateColumns: `repeat(${heatmapData.nutrients.length + 1}, 1fr)`, gridTemplateRows: `repeat(${heatmapData.nutrients.length + 1}, 1fr)` },
                    },
                    // header row
                    React.createElement("div", { className: "heatmap-cell", style: { background: "transparent" } }),
                    ...heatmapData.nutrients.map((n) =>
                      React.createElement("div", { key: "h-" + n, className: "heatmap-cell", style: { background: "#374151", fontSize: "0.55rem" } }, n.replace("(g)", ""))
                    ),
                    // data rows
                    ...heatmapData.rows.flatMap((row, ri) => [
                      React.createElement("div", { key: "l-" + ri, className: "heatmap-cell", style: { background: "#374151", fontSize: "0.55rem" } }, heatmapData.nutrients[ri].replace("(g)", "")),
                      ...row.map((v, ci) =>
                        React.createElement("div", { key: ri + "-" + ci, className: "heatmap-cell", style: { background: heatColor(v) } }, v)
                      ),
                    ])
                  )
                : React.createElement("p", { className: "text-xs text-gray-400 mt-8 text-center" }, "No data")
            )
          ),

          // Pie Chart
          React.createElement(
            "div",
            { className: "bg-white p-4 shadow-lg rounded-lg" },
            React.createElement("h3", { className: "font-semibold" }, "Pie Chart"),
            React.createElement("p", { className: "text-sm text-gray-600" }, "Recipe distribution by diet type."),
            React.createElement("div", { style: { height: "192px" } }, React.createElement("canvas", { ref: pieCanvasRef }))
          )
        )
      ),

      // ── FILTERS & DATA INTERACTION ──
      React.createElement(
        "section",
        { className: "mb-8" },
        React.createElement("h2", { className: "text-2xl font-semibold mb-4" }, "Filters and Data Interaction"),
        React.createElement(
          "div",
          { className: "flex flex-wrap gap-4" },
          React.createElement("input", {
            type: "text",
            placeholder: "Search by Diet Type",
            className: "p-2 border rounded w-full sm:w-auto",
            value: searchKeyword,
            onChange: (e) => setSearchKeyword(e.target.value),
          }),
          React.createElement(
            "select",
            {
              className: "p-2 border rounded w-full sm:w-auto",
              value: selectedDiet,
              onChange: (e) => setSelectedDiet(e.target.value),
            },
            React.createElement("option", { value: "all" }, "All Diet Types"),
            ...diets.map((d) => React.createElement("option", { key: d, value: d }, d))
          )
        )
      ),

      // ── API DATA INTERACTION ──
      React.createElement(
        "section",
        { className: "mb-8" },
        React.createElement("h2", { className: "text-2xl font-semibold mb-4" }, "API Data Interaction"),
        React.createElement(
          "div",
          { className: "flex flex-wrap gap-4" },
          React.createElement(
            "button",
            {
              className: "bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700",
              onClick: fetchInsights,
              disabled: isLoading,
            },
            isLoading ? "Loading..." : "Get Nutritional Insights"
          ),
          React.createElement(
            "button",
            {
              className: "bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700",
              onClick: () => fetchRecipes(1),
              disabled: recipesLoading,
            },
            recipesLoading ? "Loading..." : "Get Recipes"
          ),
          React.createElement(
            "button",
            {
              className: "bg-purple-600 text-white py-2 px-4 rounded hover:bg-purple-700",
              onClick: fetchInsights,
            },
            "Get Clusters"
          )
        )
      ),

      // ── RECIPE RESULTS TABLE ──
      recipes.length > 0 &&
        React.createElement(
          "section",
          { className: "mb-8" },
          React.createElement(
            "h2",
            { className: "text-2xl font-semibold mb-4" },
            "Recipe Results",
            React.createElement("span", { className: "text-sm font-normal text-gray-500 ml-2" }, `(${recipeTotalResults} total)`)
          ),
          React.createElement(
            "div",
            { className: "bg-white p-4 shadow-lg rounded-lg overflow-x-auto" },
            React.createElement(
              "table",
              { className: "recipe-table" },
              React.createElement(
                "thead",
                null,
                React.createElement(
                  "tr",
                  null,
                  ...(Object.keys(recipes[0] || {}).slice(0, 6).map((k) =>
                    React.createElement("th", { key: k }, k)
                  ))
                )
              ),
              React.createElement(
                "tbody",
                null,
                ...recipes.map((r, i) =>
                  React.createElement(
                    "tr",
                    { key: i },
                    ...(Object.keys(r).slice(0, 6).map((k) =>
                      React.createElement("td", { key: k }, typeof r[k] === "number" ? r[k].toFixed(1) : r[k])
                    ))
                  )
                )
              )
            )
          )
        ),

      // ── SECURITY & COMPLIANCE ──
      React.createElement(
        "section",
        { className: "mt-8" },
        React.createElement("h2", { className: "text-2xl font-semibold mb-4" }, "Security & Compliance"),
        React.createElement(
          "div",
          { className: "bg-white p-4 shadow-lg rounded-lg" },
          React.createElement("h3", { className: "font-semibold" }, "Security Status"),
          React.createElement(
            "p",
            { className: "text-sm text-gray-600" },
            "Encryption: ",
            React.createElement("span", { className: "font-semibold text-green-600" }, "Enabled")
          ),
          React.createElement(
            "p",
            { className: "text-sm text-gray-600" },
            "Access Control: ",
            React.createElement("span", { className: "font-semibold text-green-600" }, "Secure")
          ),
          React.createElement(
            "p",
            { className: "text-sm text-gray-600" },
            "Compliance: ",
            React.createElement("span", { className: "font-semibold text-green-600" }, "GDPR Compliant")
          )
        )
      ),

      // ── OAUTH & 2FA ──
      React.createElement(
        "section",
        { className: "mt-8" },
        React.createElement("h2", { className: "text-2xl font-semibold mb-4" }, "OAuth & 2FA Integration"),
        React.createElement(
          "div",
          { className: "bg-white p-4 shadow-lg rounded-lg" },
          React.createElement("h3", { className: "font-semibold" }, "Secure Login"),
          React.createElement(
            "button",
            {
              className: "bg-blue-600 text-white py-2 px-4 rounded mb-4 mr-2",
              onClick: () => (window.location.href = "/.auth/login/google"),
            },
            "Login with Google"
          ),
          React.createElement(
            "button",
            {
              className: "bg-blue-600 text-white py-2 px-4 rounded mb-4",
              onClick: () => (window.location.href = "/.auth/login/github"),
            },
            "Login with GitHub"
          ),
          React.createElement(
            "div",
            { className: "mt-4" },
            React.createElement("label", { htmlFor: "2fa-input", className: "block text-sm text-gray-600" }, "Enter 2FA Code"),
            React.createElement("input", {
              id: "2fa-input",
              type: "text",
              className: "p-2 border rounded w-full",
              placeholder: "Enter your 2FA code",
              value: twoFaCode,
              onChange: (e) => setTwoFaCode(e.target.value),
            })
          )
        )
      ),

      // ── CLOUD RESOURCE CLEANUP ──
      React.createElement(
        "section",
        { className: "mt-8" },
        React.createElement("h2", { className: "text-2xl font-semibold mb-4" }, "Cloud Resource Cleanup"),
        React.createElement(
          "div",
          { className: "bg-white p-4 shadow-lg rounded-lg" },
          React.createElement(
            "p",
            { className: "text-sm text-gray-600" },
            "Ensure that cloud resources are efficiently managed and cleaned up post-deployment."
          ),
          React.createElement(
            "button",
            { className: "bg-red-600 text-white py-2 px-4 rounded hover:bg-red-700 mt-2" },
            "Clean Up Resources"
          )
        )
      ),

      // ── PAGINATION ──
      React.createElement(
        "section",
        { className: "mt-8" },
        React.createElement("h2", { className: "text-2xl font-semibold mb-4" }, "Pagination"),
        React.createElement(
          "div",
          { className: "flex justify-center gap-2 mt-4" },
          React.createElement(
            "button",
            {
              className: "px-3 py-1 bg-gray-300 rounded hover:bg-gray-400 disabled:opacity-50",
              disabled: recipePage <= 1,
              onClick: () => goToPage(recipePage - 1),
            },
            "Previous"
          ),
          ...pageNumbers.map((p) =>
            React.createElement(
              "button",
              {
                key: p,
                className: p === recipePage ? "px-3 py-1 bg-blue-600 text-white rounded" : "px-3 py-1 bg-gray-300 rounded hover:bg-gray-400",
                onClick: () => goToPage(p),
              },
              p
            )
          ),
          React.createElement(
            "button",
            {
              className: "px-3 py-1 bg-gray-300 rounded hover:bg-gray-400 disabled:opacity-50",
              disabled: recipePage >= recipeTotalPages,
              onClick: () => goToPage(recipePage + 1),
            },
            "Next"
          )
        )
      )
    ),

    // ── FOOTER ──
    React.createElement(
      "footer",
      { className: "bg-blue-600 p-4 text-white text-center mt-10" },
      React.createElement("p", null, "\u00A9 2025 Nutritional Insights. All Rights Reserved.")
    )
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(React.createElement(App));