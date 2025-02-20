from flask import Flask
from flask import render_template

import glob
import os
import re
import yaml
import math
import pybtex.database, pybtex.richtext
from datetime import datetime


app = Flask(__name__)

app.jinja_env.trim_blocks = True
app.jinja_env.lstrip_blocks = True

app.static_folder = "static"

class Hyperkaehler:
    def __init__(self, key, data):
        self.key = key

        self.dimension = data["dimension"]
        n = self.dimension // 2 # this is a useful variable

        # Hodge numbers
        self.hodge = list(map(int, data["hodge"].split(" ")))
        self.hodge = [self.hodge[i:i + self.dimension + 1] for i in range(0, len(self.hodge), self.dimension + 1)]

        # Betti numbers from Hodge numbers
        self.betti = [sum([self.hodge[j][i - j] for j in range(i + 1) if j <= self.dimension and i - j <= self.dimension]) \
                for i in range(2*self.dimension + 1)]

        # signature from the Hodge numbers, see Theorem 6.33 of Voisin's Hodge theory and complex algebraic geometry, I
        self.signature = sum([(-1)**a * self.hodge[a][b] for a in range(self.dimension + 1) for b in range(self.dimension + 1)])

        # Chern numbers
        self.chern = dict()
        self.euler = 0
        if "chern" in data:
            for number in data["chern"]:
                number = list(map(int, number.split(" ")))

                value = number[-1]
                monomials = tuple(sorted([(number[i], number[i+1]) for i in range(0, len(number) - 1, 2)]))
                assert sum([monomial[0]*monomial[1] for monomial in monomials]) == self.dimension, \
                        "{} is not a valid Chern monomial of degree {}".format(monomials, self.dimension)

                self.chern[monomials] = int(value)
            self.euler = self.chern[((2*n, 1),)]

        # integral of square root of the Todd clas
        if key == "K3":        self.square_root_todd = 1
        elif key[:3] == "K3-": self.square_root_todd = str((n + 3)**n) + "/" + str(4**n * math.factorial(n))
        elif key[:3] == "Kum": self.square_root_todd = str((n + 1)**(n + 1)) + "/" + str(4**n * math.factorial(n))
        elif key == "OG6":     self.square_root_todd = "2/3"
        elif key == "OG10":    self.square_root_todd = "4/15"
        # turn it into a tuple with the reduced fraction and numerical value
        if key == "K3": self.square_root_todd = (1, 1, 1)
        else:
            integral = tuple(map(int, self.square_root_todd.split("/")))
            gcd = math.gcd(integral[0], integral[1])
            self.square_root_todd = (self.square_root_todd, str(integral[0] // gcd) + "/" + str(integral[1] // gcd), float(integral[0] / integral[1]))

        # Fujiki constant
        if key == "K3":        self.fujiki = 1
        elif key[:3] == "K3-": self.fujiki = 1
        elif key[:3] == "Kum": self.fujiki = 1 + n
        elif key == "OG6":     self.fujiki = 4
        elif key == "OG10":    self.fujiki = 1

        # Beauville-Bogomolov form
        if key == "K3":        self.bb = r"\mathrm{E}_8(-1)^{\oplus2}\oplus\mathrm{U}^{\oplus3}"
        elif key[:3] == "K3-": self.bb = r"\mathrm{E}_8(-1)^{\oplus2}\oplus\mathrm{U}^{\oplus3}\oplus(" + str(-self.dimension + 2) + ")"
        elif key[:3] == "Kum": self.bb = r"\mathrm{U}^3\oplus(" + str(-self.dimension - 2) + ")"
        elif key == "OG6":     self.bb = r"\mathrm{U}^3\oplus(-2)^{\oplus2}"
        elif key == "OG10":    self.bb = r"\mathrm{E}_8(-1)^{\oplus2}\oplus\mathrm{U}^3\oplus\mathrm{A}_2(-1)"

        # Aut_0
        if key == "K3":        self.Aut_0 = r"0"
        elif key[:3] == "K3-": self.Aut_0 = r"0"
        elif key[:3] == "Kum": self.Aut_0 = r"(\mathbb{Z}/" + str(n + 1) + r"\mathbb{Z})^4\rtimes\mathbb{Z}/2\mathbb{Z}"
        elif key == "OG6":     self.Aut_0 = r"(\mathbb{Z}/2\mathbb{Z})^8"
        elif key == "OG10":    self.Aut_0 = r"0"

        # polarisation type of Lagrangian fibration
        self.polarisations = []
        if key == "K3":        self.polarisations.append("(1)")
        elif key[:3] == "K3-": self.polarisations.append("(" + ",".join("1") + ")")
        elif key[:3] == "Kum":
            # Theorem 1.1 of MR3848435
            ds = [d for d in range(1, n+2) if (n+1) % (d*d) == 0]
            for d in ds:
                polarisation = ",".join(["(" + ",".join(["1"]*(n-2)) + ("," if n > 2 else "") + str(d) + "," + str((n+1) // d) + ")"])
                self.polarisations.append(polarisation)
        elif key == "OG6":     self.polarisations.append("(1,2,2)")
        elif key == "OG10":    self.polarisations.append("(1,1,1,1,1)")

        # HTML name
        if key == "K3":        self.name = "K3 surface"
        elif key[:3] == "K3-": self.name = "K3<sup>[{}]</sup>-type".format(n)
        elif key[:3] == "Kum": self.name = "Kum<sup>{}</sup>-type".format(n)
        elif key == "OG6":     self.name = "O'Grady's 6-dimensional sporadic type" # TODO suboptimal naming
        elif key == "OG10":    self.name = "O'Grady's 10-dimensional sporadic type"

        # shorthand name
        if key == "K3":        self.shorthand = "K3"
        elif key[:3] == "K3-": self.shorthand = "K3<sup>[{}]</sup>-type".format(n)
        elif key[:3] == "Kum": self.shorthand = "Kum<sup>{}</sup>-type".format(n)
        elif key == "OG6":     self.shorthand = "OG<sub>6</sub>"
        elif key == "OG10":    self.shorthand = "OG<sub>10</sub>"



hyperkaehlers = dict()

with open(os.path.join(os.path.realpath(os.path.dirname(__file__)), "data.yml"), "r", encoding="utf8") as f:
  data = yaml.load(f, Loader=yaml.FullLoader)

  for key in data.keys():
      hyperkaehlers[key] = Hyperkaehler(key, data[key])


bibliography = dict()

def extract_field(entry, field):
    return pybtex.richtext.Text.from_latex(entry.fields[field]).render_as("html")

with open(os.path.join(os.path.realpath(os.path.dirname(__file__)), "bibliography.bib"), "r", encoding="utf8") as f:
    data = pybtex.database.parse_string(f.read(), "bibtex")
    for key in data.entries:
        entry = data.entries[key]

        author = " and ".join([person.__str__() for (field, value) in entry.persons.items() for person in value])
        author = pybtex.richtext.Text.from_latex(author).render_as("html")

        # this will fail, let's just improve whenever needed...
        title = extract_field(entry, "title")

        if entry.type == "article":
            journal = extract_field(entry, "journal")
            volume = extract_field(entry, "volume")
            year = extract_field(entry, "year")
            pages = extract_field(entry, "pages")

            bibliography[key] = "{}. \"{}.\" In: <i>{}</i> {} ({}), pp. {}".format(author, title, journal, volume, year, pages)

        if entry.type == "incollection":
            booktitle = extract_field(entry, "booktitle")
            volume = extract_field(entry, "volume")
            year = extract_field(entry, "year")
            pages = extract_field(entry, "pages")

            bibliography[key] = "{}. \"{}.\" In: <i>{}</i> {} ({}), pp. {}".format(author, title, booktitle, volume, year, pages)

        if entry.type == "book":
            year = extract_field(entry, "year")
            series = extract_field(entry, "series")
            volume = extract_field(entry, "volume")
            pages = extract_field(entry, "pages")

            bibliography[key] = "{}. \"{}.\" {}, {}".format(author, title, series, volume)

        if entry.type == "phdthesis":
            year = extract_field(entry, "year")
            school = extract_field(entry, "school")

            bibliography[key] = "{}. \"{}.\" PhD thesis, {} ({})".format(author, title, school, year)


        if entry.type == "online":
            bibliography[key] = "{}. \"{}\"".format(author, title)


        # if doi is present append this information
        if "doi" in entry.fields:
            doi = extract_field(entry, "doi")
            bibliography[key] = "{}. doi:<a href=\"https://doi.org/{}\">{}</a>".format(bibliography[key], doi, doi)

        # if eprint is present append this information
        if "eprint" in entry.fields:
            eprint = extract_field(entry, "eprint")
            bibliography[key] = "{}. arXiv:<a href=\"https://arxiv.org/abs/{}\">{}</a>".format(bibliography[key], eprint, eprint)


# make these globally accessible
app.jinja_env.globals["bibliography"] = bibliography
app.jinja_env.globals["hyperkaehlers"] = hyperkaehlers


@app.route("/")
def index():
    return render_template("index.html")

@app.route("/about")
def about():
    return render_template("about.html")

@app.route("/explained")
def explained():
    return render_template("explained.html")

# specialised pages
@app.route("/bbf")
def bbf():
    return render_template("bbf.html")

@app.route("/beauville-fujiki") # legacy URL
def beauville_fujiki():
    return render_template("bbf.html")

@app.route("/betti")
def betti():
    return render_template("betti.html")

@app.route("/chern")
def chern():
    return render_template("chern.html")

@app.route("/euler")
def euler():
    return render_template("euler.html")

@app.route("/fujiki")
def fujiki():
    return render_template("fujiki.html")

@app.route("/hitchin-sawon")
def hitchin_sawon():
    return render_template("hitchin-sawon.html")

@app.route("/hodge")
def hodge():
    return render_template("hodge.html")

@app.route("/polarisation")
def polarisation():
    return render_template("polarisation.html")

@app.route("/Aut_0")
def aut_zero():
    return render_template("aut_zero.html")

# to make the current year accessible in templates
@app.context_processor
def inject_now():
    return {"now": datetime.utcnow()}
