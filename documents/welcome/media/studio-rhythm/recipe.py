"""Render the illustrative studio dataset. Requires matplotlib and numpy.
Run: uv run --with matplotlib python documents/welcome/media/studio-rhythm/recipe.py
All values are synthetic. The script reads and never regenerates the prepared data.
"""
from pathlib import Path
import json
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.font_manager import FontProperties, fontManager

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
DATA = json.loads((HERE / "data.json").read_text())
for face in ["Regular", "Semibold"]:
    fontManager.addfont(str(ROOT / "assets" / "fonts" / f"OpenDocSans-{face}.ttf"))
regular = FontProperties(fname=ROOT / "assets/fonts/OpenDocSans-Regular.ttf")
bold = FontProperties(fname=ROOT / "assets/fonts/OpenDocSans-Semibold.ttf")
plt.rcParams.update({"font.family": regular.get_name(), "font.size": 9.5, "text.color": "#171A1D", "axes.labelcolor": "#62686D", "xtick.color": "#62686D", "ytick.color": "#62686D", "axes.edgecolor": "#D7D7D2", "axes.linewidth": .6, "svg.fonttype": "path"})
stages = DATA["stages"]
rows = DATA["documents"]
weeks = np.arange(1, 13)
values = np.array([[sum(row[stage] for row in rows if row["week"] == week) for week in weeks] for stage in stages])
palette = ["#D4D0C7", "#969DA5", "#30363C", "#3758F9"]
fig = plt.figure(figsize=(7.6, 4.8), facecolor="#FFFFFF")
fig.text(.055, .964, "A / THE SHAPE OF A WORKING SEASON", fontsize=8, fontproperties=bold)
fig.text(.055, .914, "Hours per week · 24 fictional documents over 12 weeks", fontsize=8.5, color="#62686D")
ax = fig.add_axes([.065, .50, .91, .35])
ax.stackplot(weeks, values, colors=palette, linewidth=.6, edgecolor="white", alpha=1)
ax.set_xlim(1, 12)
ax.set_ylim(0, 100)
ax.set_yticks([0, 25, 50, 75, 100])
ax.set_xticks([1, 3, 5, 7, 9, 12], ["W01", "W03", "W05", "W07", "W09", "W12"])
ax.tick_params(length=0, pad=6, labelsize=8)
ax.grid(axis="y", color="#D7D7D2", alpha=.55, linewidth=.5)
ax.set_axisbelow(True)
for side in ["top", "right", "left"]:
    ax.spines[side].set_visible(False)
for i, (stage, color) in enumerate(zip(stages, palette)):
    x = .075 + i * .235
    fig.add_artist(plt.Rectangle((x, .415), .014, .014, transform=fig.transFigure, color=color, clip_on=False))
    fig.text(x + .025, .415, stage.capitalize(), fontsize=8.5)

fig.text(.055, .345, "B / WHERE THE TIME GOES", fontsize=8, fontproperties=bold)
bar = fig.add_axes([.17, .08, .30, .20])
totals = values.sum(axis=1)
y = np.arange(4)
bar.barh(y, totals, height=.52, color=palette)
bar.set_yticks(y, [s.capitalize() for s in stages], fontsize=8)
bar.invert_yaxis()
bar.set_xlim(0, max(totals) * 1.25)
bar.set_xticks([])
bar.tick_params(axis="y", length=0, pad=8)
for spine in bar.spines.values(): spine.set_visible(False)
for i, total in enumerate(totals):
    bar.text(total + 6, i, f"{total:.0f} h", va="center", fontsize=8)

fig.text(.56, .345, "C / EVERY DOCUMENT IS DIFFERENT", fontsize=8, fontproperties=bold)
scatter = fig.add_axes([.605, .10, .365, .18])
pages = [row["pages"] for row in rows]
hours = [sum(row[s] for s in stages) for row in rows]
scatter.scatter(pages, hours, c="#969DA5", s=20, linewidths=.5, edgecolors="#FFFFFF", alpha=.9)
focus = rows.index(max(rows, key=lambda r: r["review"]))
scatter.scatter([pages[focus]], [hours[focus]], color="#3758F9", s=30, zorder=3, edgecolors="white", linewidths=.6)
scatter.set_xlim(0, 22)
scatter.set_ylim(0, 70)
scatter.set_xticks([0, 10, 20])
scatter.set_yticks([0, 30, 60])
scatter.set_xlabel("Document length (pages)", fontsize=7.5, labelpad=4)
scatter.set_ylabel("Hours", fontsize=7.5, labelpad=1)
scatter.tick_params(length=0, pad=4, labelsize=7.5)
scatter.grid(color="#EAE7DF", linewidth=.5)
scatter.set_axisbelow(True)
for side in ["top", "right"]: scatter.spines[side].set_visible(False)
fig.savefig(HERE / "image.png", dpi=320, facecolor="white")
fig.savefig(HERE / "chart.svg", facecolor="white")
plt.close(fig)
print(json.dumps({"documents": len(rows), "hours": int(sum(totals)), "stages": dict(zip(stages, map(int, totals))), "peak_week_hours": int(values.sum(axis=0).max()), "image": str(HERE / "image.png")}, indent=2))
