// Test du parser
const line1 = "5 × 1 000 m en 3'56 à 4'00";
const line2 = "3 × 12' à 4'02 à 4'05/km";
const line3 = "1h15 en endurance fondamentale";

// Test 1: 5×1000m = 5km
const frac = line1.match(/(\d+)\s*[×x]\s*(\d+)\s*000\s*m/i);
console.log("Test 1 (5×1000m):", frac);

// Test 2: 3×12' à 4'02
const series = line2.match(/(\d+)\s*[×x]\s*(\d+)'/i);
console.log("Test 2 (3×12'):", series);

// Test 3: 1h15
const time = line3.match(/(\d+)h(\d+)/i);
console.log("Test 3 (1h15):", time);
