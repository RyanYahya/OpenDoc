"""Render one slide-sized chart from the welcome guide's synthetic dataset.
Run: uv run --with matplotlib python documents/welcome-presentation/media/studio-rhythm/recipe.py
The prepared data remain unchanged. No actual activity is represented.
"""
from pathlib import Path
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.font_manager import FontProperties, fontManager
from matplotlib.patches import Patch

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
data = json.loads((HERE / 'data.json').read_text())
for face in ['Regular', 'Semibold']:
    fontManager.addfont(str(ROOT / 'assets/fonts' / f'OpenDocSans-{face}.ttf'))
regular = FontProperties(fname=ROOT / 'assets/fonts/OpenDocSans-Regular.ttf')
plt.rcParams.update({'font.family': regular.get_name(), 'font.size': 16,
    'text.color': '#171A1D', 'axes.labelcolor': '#62686D',
    'xtick.color': '#62686D', 'ytick.color': '#62686D',
    'axes.edgecolor': '#D7D7D2', 'axes.linewidth': .7, 'svg.fonttype': 'path'})
stages = data['stages']
weeks = np.arange(1, 13)
values = np.array([[sum(row[stage] for row in data['documents'] if row['week'] == week)
                   for week in weeks] for stage in stages])
palette = ['#D4D0C7', '#969DA5', '#30363C', '#3758F9']
fig = plt.figure(figsize=(14.4, 5), facecolor='white')
ax = fig.add_axes([.058, .22, .922, .64])
ax.stackplot(weeks, values, colors=palette, linewidth=.8, edgecolor='white')
ax.set_xlim(1, 12)
ax.set_ylim(0, 110)
ax.set_yticks([0, 25, 50, 75, 100])
ax.set_xticks(weeks, [f'W{i:02}' for i in weeks])
ax.tick_params(length=0, pad=9, labelsize=15)
ax.grid(axis='y', color='#D7D7D2', linewidth=.6)
ax.set_axisbelow(True)
for side in ['top', 'right', 'left']:
    ax.spines[side].set_visible(False)
fig.text(.058, .936, 'Hours per week', fontsize=16, color='#62686D')
fig.legend(handles=[Patch(facecolor=color, label=stage.capitalize()) for stage, color in zip(stages, palette)],
    loc='lower center', bbox_to_anchor=(.52, .012), ncol=4, frameon=False,
    fontsize=16, handlelength=1.1, handleheight=.7, columnspacing=3)
fig.savefig(HERE / 'image.png', dpi=300, facecolor='white')
fig.savefig(HERE / 'chart.svg', facecolor='white')
plt.close(fig)
print(json.dumps({'documents':len(data['documents']), 'weeks':len(weeks),
    'hours':int(values.sum()), 'workstreams':dict(zip(stages,map(int,values.sum(axis=1))))},indent=2))
