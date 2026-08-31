#!/usr/bin/env sage
"""Build the perverse-Hodge octahedron data from the LLV decomposition.

The three octahedron coordinates are the first three orthonormal weight
coordinates of the LLV representation. Coordinates are stored doubled, so
the half-integral weights occurring for generalised Kummer varieties remain
exact integers in JSON. Each deformation type gets its own file so the site
can load only the octahedron currently being viewed.
"""

import json
from collections import defaultdict
from fractions import Fraction
from itertools import permutations
from math import comb
from pathlib import Path

from sage.all import Partitions, QQ, SymmetricFunctions, WeylCharacterRing


ROOT = Path(__file__).resolve().parent.parent
LLV_PATH = ROOT / "static" / "llv-data.js"
OUTPUT_DIRECTORY = ROOT / "static" / "octahedron-data"
PREFIX = "const LLV_DATA = "
SCHUR = SymmetricFunctions(QQ).schur()


def load_llv_data():
    source = LLV_PATH.read_text(encoding="utf-8").strip()
    if not source.startswith(PREFIX):
        raise ValueError(f"unexpected format in {LLV_PATH}")
    return json.loads(source[len(PREFIX):].removesuffix(";"))


def parse_weight(label, rank):
    if label == "()":
        values = []
    else:
        values = [Fraction(value) for value in label[1:-1].split(",")]
    if len(values) > rank:
        raise ValueError(f"weight {label} has more than {rank} coordinates")
    return tuple(QQ(value.numerator) / value.denominator for value in values) + (QQ(0),) * (rank - len(values))


def projected_character_freudenthal(ring, label, rank):
    representation = ring(parse_weight(label, rank))
    projected = defaultdict(int)
    for weight, multiplicity in representation.weight_multiplicities().items():
        coordinates = weight.to_vector()
        doubled = tuple(int(2 * coordinate) for coordinate in coordinates[:3])
        projected[doubled] += int(multiplicity)
    return projected


def add_polynomial(target, source, factor=1):
    for exponent, coefficient in source.items():
        target[exponent] += factor * coefficient
        if target[exponent] == 0:
            del target[exponent]


def multiply_polynomials(left, right):
    product = defaultdict(int)
    for left_exponent, left_coefficient in left.items():
        for right_exponent, right_coefficient in right.items():
            exponent = tuple(a + b for a, b in zip(left_exponent, right_exponent))
            product[exponent] += left_coefficient * right_coefficient
    return product


def complete_symmetric_polynomials(standard_dimension, maximum_degree):
    """Return h_0,...,h_max for the projected standard representation."""
    weight_multiplicities = [
        ((1, 0, 0), 1),
        ((-1, 0, 0), 1),
        ((0, 1, 0), 1),
        ((0, -1, 0), 1),
        ((0, 0, 1), 1),
        ((0, 0, -1), 1),
        ((0, 0, 0), standard_dimension - 6),
    ]
    complete = [defaultdict(int) for _ in range(maximum_degree + 1)]
    complete[0][(0, 0, 0)] = 1
    for weight, multiplicity in weight_multiplicities:
        updated = [defaultdict(int) for _ in range(maximum_degree + 1)]
        for old_degree, polynomial in enumerate(complete):
            for added_degree in range(maximum_degree - old_degree + 1):
                symmetric_power_multiplicity = comb(multiplicity + added_degree - 1, added_degree)
                shift = tuple(added_degree * coordinate for coordinate in weight)
                for exponent, coefficient in polynomial.items():
                    shifted = tuple(a + b for a, b in zip(exponent, shift))
                    updated[old_degree + added_degree][shifted] += coefficient * symmetric_power_multiplicity
        complete = updated
    return complete


def permutation_sign(permutation):
    inversions = sum(
        permutation[i] > permutation[j]
        for i in range(len(permutation))
        for j in range(i + 1, len(permutation))
    )
    return -1 if inversions % 2 else 1


def schur_character(partition, complete):
    """Evaluate a Schur functor using the Jacobi-Trudi determinant."""
    if not partition:
        return {(0, 0, 0): 1}
    length = len(partition)
    character = defaultdict(int)
    for permutation in permutations(range(length)):
        term = {(0, 0, 0): 1}
        for row, column in enumerate(permutation):
            degree = partition[row] - row + column
            if degree < 0:
                term = {}
                break
            term = multiply_polynomials(term, complete[degree])
        add_polynomial(character, term, permutation_sign(permutation))
    return character


def orthogonal_branching_coefficient(partition, subpartition):
    difference = sum(partition) - sum(subpartition)
    if difference < 0 or difference % 2:
        return 0
    coefficient = 0
    for delta in Partitions(difference // 2):
        even_partition = tuple(2 * part for part in delta)
        coefficient += int((SCHUR[subpartition] * SCHUR[even_partition]).coefficient(partition))
    return coefficient


def projected_tensor_character(partition, complete, cache):
    """Project a tensor representation of SO(N) to its first three weights.

    Littlewood's GL-to-O restriction rule expresses the Schur functor as the
    requested traceless orthogonal representation plus lower partitions.
    Working after projection avoids enumerating millions of high-rank weights.
    """
    partition = tuple(partition)
    if partition in cache:
        return cache[partition]

    character = defaultdict(int, schur_character(partition, complete))
    for smaller_size in range(sum(partition) - 2, -1, -2):
        for subpartition in Partitions(smaller_size):
            subpartition = tuple(subpartition)
            coefficient = orthogonal_branching_coefficient(partition, subpartition)
            if coefficient:
                lower_character = projected_tensor_character(subpartition, complete, cache)
                add_polynomial(character, lower_character, -coefficient)
    cache[partition] = character
    return character


def integer_partition(label):
    weight = parse_weight(label, 4)
    if any(not coordinate.is_integer() for coordinate in weight):
        return None
    return tuple(int(coordinate) for coordinate in weight if coordinate)


def hodge_collapse(record, points):
    collapsed = defaultdict(int)
    for (x2, _y2, z2), multiplicity in points.items():
        collapsed[(record["dim"] + z2, x2)] += multiplicity
    return collapsed


def validate_record(key, record, points):
    dimension = record["dim"]
    expected_total = sum(sum(row) for row in record["diamond"])
    actual_total = sum(points.values())
    if actual_total != expected_total:
        raise ValueError(f"{key}: octahedron has dimension {actual_total}, expected {expected_total}")

    collapsed = hodge_collapse(record, points)
    for degree, row in enumerate(record["diamond"]):
        first_p = max(0, degree - dimension)
        for offset, expected in enumerate(row):
            p = first_p + offset
            x2 = 2 * p - degree
            actual = collapsed[(degree, x2)]
            if actual != expected:
                raise ValueError(
                    f"{key}: H^{degree}, weight {x2}/2 collapses to {actual}, expected {expected}"
                )

    for x2, y2, z2 in points:
        if abs(x2) + abs(y2) + abs(z2) > dimension:
            raise ValueError(f"{key}: weight {(x2, y2, z2)} lies outside the octahedron")


def build_record(key, record, cache):
    b2 = sum(record["diamond"][2])
    standard_dimension = b2 + 2
    rank = standard_dimension // 2
    cartan_type = ("B" if standard_dimension % 2 else "D") + str(rank)
    ring = WeylCharacterRing(cartan_type, style="orthonormal")
    maximum_degree = max(
        sum(integer_partition(label) or ())
        for label in record["llv-comps"]
        if integer_partition(label) is not None
    )
    complete = complete_symmetric_polynomials(standard_dimension, maximum_degree)
    tensor_cache = {}

    points = defaultdict(int)
    for label in record["llv-comps"]:
        cache_key = (cartan_type, label)
        if cache_key not in cache:
            partition = integer_partition(label)
            if partition is not None:
                character = projected_tensor_character(partition, complete, tensor_cache)
                cache[cache_key] = {
                    tuple(2 * coordinate for coordinate in exponent): multiplicity
                    for exponent, multiplicity in character.items()
                }
            else:
                cache[cache_key] = projected_character_freudenthal(ring, label, rank)
        component_multiplicity = int(record["llv"][label]["m"])
        for coordinates, weight_multiplicity in cache[cache_key].items():
            points[coordinates] += component_multiplicity * weight_multiplicity

    validate_record(key, record, points)
    ordered = [
        [int(x2), int(y2), int(z2), int(multiplicity)]
        for (x2, y2, z2), multiplicity in sorted(
            points.items(), key=lambda item: (item[0][2], item[0][1], item[0][0])
        )
    ]
    return {"dim": int(record["dim"]), "points": ordered}


def main():
    llv_data = load_llv_data()
    character_cache = {}
    output = {
        key: build_record(key, record, character_cache)
        for key, record in llv_data.items()
    }
    OUTPUT_DIRECTORY.mkdir(parents=True, exist_ok=True)
    for key, record in output.items():
        payload = json.dumps(record, separators=(",", ":"))
        output_path = OUTPUT_DIRECTORY / f"{key}.json"
        output_path.write_text(f"{payload}\n", encoding="utf-8")
    print(f"wrote {OUTPUT_DIRECTORY.relative_to(ROOT)} ({len(output)} types)")


if __name__ == "__main__":
    main()
