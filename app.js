// Global State
let combinedData = [];

// Magnet schools to exclude
const excludedSchools = [
    "Bergen County Academies", 
    "Bergen County Technical High School - Teterboro", 
    "Applied Technology High School", 
    "Bergen County Institute for Science and Technology", 
    "Bergen Arts and Sciences Charter School"
];

const calcBtn = document.getElementById('calculate-btn');
const resultsContainer = document.getElementById('results-container');
const rankingsList = document.getElementById('rankings-list');

// Metric configurations (maps UI ids to data keys and logic)
const metrics = [
    { id: 'sat', key: 'SatScore', invert: false },
    { id: 'pol', key: 'AvgDemPct', invert: false },
    { id: 'grad', key: 'GradRate', invert: false },
    { id: 'ap', key: 'APRate', invert: false },
    { id: 'art', key: 'ArtsRate', invert: false },
    { id: 'ratio', key: 'StudentTeacherRatio', invert: true }, // lower ratio is better
    { id: 'exp', key: 'TeacherExp', invert: false },
    { id: 'inc', key: 'IncidentRate', invert: true } // lower incidents is better
];

// Setup Event Listeners for Sliders and Checkboxes
metrics.forEach(m => {
    const slider = document.getElementById(`weight-${m.id}`);
    const checkbox = document.getElementById(`check-${m.id}`);
    const group = document.getElementById(`group-${m.id}`);
    const valDisplay = document.getElementById(`val-${m.id}`);

    slider.addEventListener('input', (e) => {
        valDisplay.innerText = e.target.value;
        if(combinedData.length > 0) calculateRanking();
    });

    checkbox.addEventListener('change', (e) => {
        if(e.target.checked) {
            group.classList.remove('disabled');
        } else {
            group.classList.add('disabled');
        }
        if(combinedData.length > 0) calculateRanking();
    });
});

// 1. Auto-Parse Consolidated CSV File on Load
Papa.parse('Merged_Bergen_Schools_V4.csv', {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function(results) {
        combinedData = results.data.map(row => {
            return {
                School: row['SchoolName'],
                TownsText: row['TownsText'],
                AvgDemPct: parseFloat(row['AvgDemPct']) || 0,
                GradRate: parseFloat(row['GradRate']) || 0,
                Absenteeism: parseFloat(row['Absenteeism']) || 0,
                SatScore: parseFloat(row['SatScore']) || 0,
                CollegeRate: parseFloat(row['CollegeRate']) || 0,
                APRate: parseFloat(row['APRate']) || 0,
                ArtsRate: parseFloat(row['ArtsRate']) || 0,
                StudentTeacherRatio: parseFloat(row['StudentTeacherRatio']) || 0,
                TeacherExp: parseFloat(row['TeacherExp']) || 0,
                IncidentRate: parseFloat(row['IncidentRate']) || 0
            };
        }).filter(item => item.School && item.TownsText && !excludedSchools.includes(item.School));
        
        calcBtn.disabled = false;
        
        // Auto calculate on load so user sees results immediately
        calculateRanking();
    },
    error: function(err) {
        console.error("Error loading CSV:", err);
    }
});

// 2. Calculate Weighted Sum Model (WSM)
calcBtn.addEventListener('click', calculateRanking);

function calculateRanking() {
    if(combinedData.length === 0) return;
    
    // Dynamically calculate min/max for normalization based on dataset
    const bounds = {};
    metrics.forEach(m => {
        let validData = combinedData.map(d => d[m.key]).filter(v => v > 0 || m.key === 'IncidentRate' || m.key === 'AvgDemPct'); // Keep 0s for incident rate and dem pct
        if (validData.length === 0) validData = [0];
        
        bounds[m.key] = {
            max: Math.max(...validData),
            min: Math.min(...validData)
        };
    });

    // Calculate Score for each school
    combinedData.forEach(item => {
        let totalScore = 0;
        let totalWeight = 0;

        metrics.forEach(m => {
            const checkbox = document.getElementById(`check-${m.id}`);
            const slider = document.getElementById(`weight-${m.id}`);
            
            // If checkbox is off, weight is 0
            let rawWeight = checkbox.checked ? parseInt(slider.value) : 0;
            let actualWeight = Math.abs(rawWeight);
            let currentInvert = rawWeight < 0 ? !m.invert : m.invert;
            
            totalWeight += actualWeight;

            if (actualWeight > 0) {
                let val = item[m.key];
                
                // If data is missing (0), ignore this metric for this school so it doesn't artificially tank their score
                if (val === 0 && m.key !== 'IncidentRate' && m.key !== 'AvgDemPct') {
                    totalWeight -= actualWeight; // Remove this metric's weight from the denominator
                } else {
                    let b = bounds[m.key];
                    let norm = 50; // default if min == max
                    
                    if (b.max !== b.min) {
                        if (currentInvert) {
                            norm = ((b.max - val) / (b.max - b.min)) * 100;
                        } else {
                            norm = ((val - b.min) / (b.max - b.min)) * 100;
                        }
                    }
                    totalScore += (norm * actualWeight);
                }
            }
        });

        // Apply +3 points for Northern Highlands
        let final = totalWeight === 0 ? 0 : Math.round(totalScore / totalWeight);
        if (item.School === "Northern Highlands Regional High School") {
            final += 3;
        }

        // Avoid division by zero, and enforce a maximum score ceiling of 100
        item.FinalScore = Math.min(100, final);
    });

    // Sort by Score Descending
    combinedData.sort((a, b) => b.FinalScore - a.FinalScore);
    renderResults();
}

// 3. Render Top 5
function renderResults() {
    resultsContainer.classList.remove('hidden');
    rankingsList.innerHTML = '';

    const top5 = combinedData.slice(0, 5);

    top5.forEach((item, index) => {
        const el = document.createElement('div');
        el.className = 'school-card';
        
        let townsStr = item.TownsText;
        if (townsStr) {
            let townsArray = townsStr.split(',').map(t => t.trim());
            townsArray.sort((a, b) => {
                let matchA = a.match(/\(([\d.]+)%\)/);
                let matchB = b.match(/\(([\d.]+)%\)/);
                let taxA = matchA ? parseFloat(matchA[1]) : 999;
                let taxB = matchB ? parseFloat(matchB[1]) : 999;
                return taxA - taxB;
            });
            townsStr = townsArray.join(', ');
        }
        let cleanTowns = townsStr;
        
        el.innerHTML = `
            <div class="school-header">
                <div class="school-name">#${index + 1}. ${item.School}</div>
                <div class="school-score">${item.FinalScore} <span style="font-size:0.8rem; color:#94a3b8">Score</span></div>
            </div>
            <div style="font-size:0.95rem; color:#cbd5e1; margin-bottom:10px;">
                <i class="fa-solid fa-map-location-dot"></i> Towns: <span style="color:#94a3b8">${cleanTowns}</span>
            </div>
            <div class="details-grid">
                <div><i class="fa-solid fa-book-open-reader"></i> <strong>SAT:</strong> ${item.SatScore > 0 ? item.SatScore : "N/A"}</div>
                <div><i class="fa-solid fa-hands-holding-circle"></i> <strong>DEI:</strong> ${item.AvgDemPct}%</div>
                <div><i class="fa-solid fa-university"></i> <strong>College:</strong> ${item.CollegeRate}%</div>
                <div><i class="fa-solid fa-brain"></i> <strong>AP/IB:</strong> ${item.APRate}%</div>
                <div><i class="fa-solid fa-palette"></i> <strong>Arts:</strong> ${item.ArtsRate}%</div>
                <div><i class="fa-solid fa-graduation-cap"></i> <strong>Grad:</strong> ${item.GradRate}%</div>
                <div><i class="fa-solid fa-users"></i> <strong>Ratio:</strong> ${item.StudentTeacherRatio}:1</div>
                <div><i class="fa-solid fa-chalkboard-user"></i> <strong>Exp:</strong> ${item.TeacherExp} Yrs</div>
                <div><i class="fa-solid fa-user-check"></i> <strong>Absent:</strong> ${item.Absenteeism}%</div>
                <div><i class="fa-solid fa-shield-halved"></i> <strong>Incidents:</strong> ${item.IncidentRate}</div>
            </div>
        `;
        rankingsList.appendChild(el);
    });
}
