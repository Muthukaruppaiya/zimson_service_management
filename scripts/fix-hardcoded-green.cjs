const fs = require("fs");

const fixes = [
  {
    file: "src/components/layout/Sidebar.tsx",
    from: "linear-gradient(180deg, #006039 0%, #004428 100%)",
    to: "linear-gradient(180deg, #1B3A8F 0%, #102570 100%)",
  },
  {
    file: "src/pages/LoginPage.tsx",
    from: 'background: "#006039"',
    to: 'background: "#1B3A8F"',
  },
  {
    file: "src/pages/LoginPage.tsx",
    from: 'color: "#006039"',
    to: 'color: "#C9A227"',
  },
  {
    file: "src/components/layout/Sidebar.tsx",
    from: "bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.25)]",
    to: "bg-blue-400 shadow-[0_0_0_3px_rgba(59,130,246,0.25)]",
  },
];

for (const { file, from, to } of fixes) {
  let src = fs.readFileSync(file, "utf8");
  if (src.includes(from)) {
    fs.writeFileSync(file, src.split(from).join(to));
    console.log("✓ Fixed:", file);
  } else {
    console.log("⚠ Not found:", from.slice(0, 40), "in", file);
  }
}
console.log("Done.");
