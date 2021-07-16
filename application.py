from flask import Flask
from flask import render_template

import glob
import os
import re
import yaml

app = Flask(__name__)

app.jinja_env.trim_blocks = True
app.jinja_env.lstrip_blocks = True

class Hyperkaehler:
    def __init__(self, key, data):
        self.key = key

        self.dimension = data["dimension"]

        self.hodge = list(map(int, data["hodge"].split(" ")))
        self.hodge = [self.hodge[i:i + self.dimension + 1] for i in range(0, len(self.hodge), self.dimension + 1)]

        self.betti = [sum([self.hodge[j][i - j] for j in range(i + 1) if j <= self.dimension and i - j <= self.dimension]) \
                for i in range(2*self.dimension + 1)]

        if key == "K3":        self.fujiki = 1
        elif key[:3] == "K3-": self.fujiki = 1
        elif key[:3] == "Kum": self.fujiki = 1 + self.dimension // 2
        elif key == "OG6":     self.fujiki = 4
        elif key == "OG10":    self.fujiki = 1

        if key == "K3":        self.bb = r"\mathrm{E}_8(-1)^{\oplus2}\oplus\mathrm{U}^{\oplus3}"
        elif key[:3] == "K3-": self.bb = r"\mathrm{E}_8(-1)^{\oplus2}\oplus\mathrm{U}^{\oplus3}\oplus(" + str(-self.dimension + 2) + ")"
        elif key[:3] == "Kum": self.bb = r"\mathrm{U}^3\oplus(" + str(-self.dimension - 2) + ")"
        elif key == "OG6":     self.bb = r"\mathrm{U}^3\oplus(-2)^{\oplus2}"
        elif key == "OG10":    self.bb = r"\mathrm{E}_8(-1)^{\oplus2}\oplus\mathrm{U}^3\oplus\mathrm{A}_2(-1)"

        if key == "K3":        self.name = "K3 surface"
        elif key[:3] == "K3-": self.name = "K3<sup>[{}]</sup>-type".format(self.dimension // 2)
        elif key[:3] == "Kum": self.name = "Kum<sup>[{}]</sup>-type".format(self.dimension // 2)
        elif key == "OG6":     self.name = "O'Grady's 6-dimensional sporadic type"
        elif key == "OG10":    self.name = "O'Grady's 10-dimensional sporadic type"



hyperkaehlers = dict()

with open(os.path.join(os.path.realpath(os.path.dirname(__file__)), "data.yml"), "r", encoding="utf8") as f:
  data = yaml.load(f, Loader=yaml.FullLoader)

  for key in data.keys():
      hyperkaehlers[key] = Hyperkaehler(key, data[key])


@app.route("/")
def index():
  return render_template("index.html", hyperkaehlers=hyperkaehlers)


@app.route("/about")
def about():
  return render_template("about.html")


@app.route("/fujiki")
def fujiki():
  return render_template("fujiki.html")
