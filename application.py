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

        # Hodge numbers
        self.hodge = list(map(int, data["hodge"].split(" ")))
        self.hodge = [self.hodge[i:i + self.dimension + 1] for i in range(0, len(self.hodge), self.dimension + 1)]

        # Betti numbers from Hodge numbers
        self.betti = [sum([self.hodge[j][i - j] for j in range(i + 1) if j <= self.dimension and i - j <= self.dimension]) \
                for i in range(2*self.dimension + 1)]

        # Chern numbers
        self.chern = dict()
        if "chern" in data:
            for number in data["chern"]:
                print(number)
                number = list(map(int, number.split(" ")))

                value = number[-1]
                monomials = tuple(sorted([(number[i], number[i+1]) for i in range(0, len(number) - 1, 2)]))
                assert sum([monomial[0]*monomial[1] for monomial in monomials]) == self.dimension, \
                        "{} is not a valid Chern monomial of degree {}".format(monomials, self.dimension)

                self.chern[monomials] = int(value)

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
        elif key == "OG6":     self.name = "O'Grady's 6-dimensional sporadic type" # TODO suboptimal naming
        elif key == "OG10":    self.name = "O'Grady's 10-dimensional sporadic type"

        if key == "K3":        self.shorthand = "K3"
        elif key[:3] == "K3-": self.shorthand = "K3<sup>[{}]</sup>-type".format(self.dimension // 2)
        elif key[:3] == "Kum": self.shorthand = "Kum<sup>[{}]</sup>-type".format(self.dimension // 2)
        elif key == "OG6":     self.shorthand = "OG<sub>6</sub>"
        elif key == "OG10":    self.shorthand = "OG<sub>10</sub>"



hyperkaehlers = dict()

with open(os.path.join(os.path.realpath(os.path.dirname(__file__)), "data.yml"), "r", encoding="utf8") as f:
  data = yaml.load(f, Loader=yaml.FullLoader)

  for key in data.keys():
      hyperkaehlers[key] = Hyperkaehler(key, data[key])


@app.route("/")
def index(): return render_template("index.html", hyperkaehlers=hyperkaehlers)

@app.route("/about")
def about(): return render_template("about.html")

# specialised pages
@app.route("/betti")
def betti(): return render_template("betti.html", hyperkaehlers=hyperkaehlers)

@app.route("/chern")
def chern(): return render_template("chern.html", hyperkaehlers=hyperkaehlers)

@app.route("/fujiki")
def fujiki(): return render_template("fujiki.html")
