"""
parameters.py

CATIA V5 "Create and use Parameters" (chapter 12 of the TU Graz script):
named parameters, formulas relating them (the script's `length = width*3`),
and design tables (one row of parameter values per family member).

Formulas are parsed with Python's `ast` and evaluated by walking the tree
against a whitelist — numbers, + - * / ** %, parentheses, parameter names,
and a fixed set of math functions — so nothing a user types can execute
code. CATIA-style unit suffixes are accepted and normalised to mm and
degrees: `20mm`, `2cm`, `0.1m`, `1in`, `30deg`, `0.5rad`.

A part template is any JSON (typically a /build_part request) in which a
string value starting with "=" is a formula, e.g. {"depth": "=height/2"}.
resolve_template() substitutes the evaluated numbers, so formulas drive
real geometry without the part schema having to know about parameters.
"""

from __future__ import annotations

import ast
import math
import operator
import re
from typing import Any

_UNITS = {"mm": 1.0, "cm": 10.0, "m": 1000.0, "in": 25.4, "deg": 1.0, "rad": 180.0 / math.pi}
# A number (not the tail of an identifier like x2) directly followed by a unit.
_UNIT_RE = re.compile(r"(?<![A-Za-z_\d.])(\d[\d.]*(?:[eE][+-]?\d+)?)\s*(mm|cm|m|in|deg|rad)\b")

_FUNCS = {
    "sin": lambda d: math.sin(math.radians(d)), "cos": lambda d: math.cos(math.radians(d)),
    "tan": lambda d: math.tan(math.radians(d)), "asin": lambda x: math.degrees(math.asin(x)),
    "acos": lambda x: math.degrees(math.acos(x)), "atan": lambda x: math.degrees(math.atan(x)),
    "atan2": lambda y, x: math.degrees(math.atan2(y, x)), "sqrt": math.sqrt, "abs": abs,
    "min": min, "max": max, "round": round, "floor": math.floor, "ceil": math.ceil,
    "log": math.log, "exp": math.exp, "if_else": lambda c, a, b: a if c else b,
}
_CONSTS = {"pi": math.pi, "PI": math.pi, "e": math.e}
_BINOPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv,
           ast.Pow: operator.pow, ast.Mod: operator.mod, ast.FloorDiv: operator.floordiv}
_CMPOPS = {ast.Lt: operator.lt, ast.LtE: operator.le, ast.Gt: operator.gt, ast.GtE: operator.ge,
           ast.Eq: operator.eq, ast.NotEq: operator.ne}


class FormulaError(ValueError):
    pass


def _normalise(expr: str) -> str:
    return _UNIT_RE.sub(lambda m: f"({m.group(1)}*{_UNITS[m.group(2)]!r})", str(expr).strip())


def parse(expr: str) -> ast.Expression:
    text = _normalise(expr)
    if not text:
        raise FormulaError("empty formula")
    try:
        return ast.parse(text, mode="eval")
    except SyntaxError as e:
        raise FormulaError(f"cannot parse {expr!r}: {e.msg}") from e


def names_in(tree: ast.AST) -> set[str]:
    return {n.id for n in ast.walk(tree) if isinstance(n, ast.Name) and n.id not in _FUNCS and n.id not in _CONSTS}


def _eval(node: ast.AST, values: dict[str, float]) -> float:
    if isinstance(node, ast.Expression):
        return _eval(node.body, values)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
        return node.value
    if isinstance(node, ast.Name):
        if node.id in values:
            return values[node.id]
        if node.id in _CONSTS:
            return _CONSTS[node.id]
        raise FormulaError(f"unknown parameter {node.id!r}")
    if isinstance(node, ast.BinOp) and type(node.op) in _BINOPS:
        return _BINOPS[type(node.op)](_eval(node.left, values), _eval(node.right, values))
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
        v = _eval(node.operand, values)
        return -v if isinstance(node.op, ast.USub) else v
    if isinstance(node, ast.Compare) and len(node.ops) == 1 and type(node.ops[0]) in _CMPOPS:
        return float(_CMPOPS[type(node.ops[0])](_eval(node.left, values), _eval(node.comparators[0], values)))
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in _FUNCS and not node.keywords:
        return _FUNCS[node.func.id](*[_eval(a, values) for a in node.args])
    raise FormulaError(f"not allowed in a formula: {ast.dump(node)[:60]}")


def evaluate(expr, values: dict[str, float] | None = None) -> float:
    if isinstance(expr, (int, float)) and not isinstance(expr, bool):
        return float(expr)
    try:
        result = _eval(parse(expr), values or {})
    except FormulaError:
        raise
    except (ZeroDivisionError, OverflowError, ValueError, TypeError) as e:
        raise FormulaError(f"{expr!r}: {e}") from e
    if not isinstance(result, (int, float)) or not math.isfinite(result):
        raise FormulaError(f"{expr!r} does not evaluate to a finite number")
    return float(result)


def evaluate_parameters(params: list[dict]) -> dict:
    """params: [{name, formula | value}]. Resolves in dependency order
    (like CATIA's Relations), reporting cycles and per-parameter errors
    instead of failing the whole set."""
    exprs: dict[str, Any] = {}
    errors: dict[str, str] = {}
    for p in params:
        name = str(p.get("name", "")).strip()
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
            errors[name or "?"] = "parameter names must be letters, digits and _ (not starting with a digit)"
            continue
        if name in exprs:
            errors[name] = "duplicate parameter name"
            continue
        exprs[name] = p.get("formula", p.get("value", 0))

    deps: dict[str, set[str]] = {}
    for name, expr in exprs.items():
        if isinstance(expr, (int, float)):
            deps[name] = set()
            continue
        try:
            deps[name] = names_in(parse(expr))
        except FormulaError as e:
            errors[name] = str(e)
    values: dict[str, float] = {}
    order: list[str] = []
    state: dict[str, int] = {}  # 1 = visiting, 2 = done

    def visit(n: str, stack: list[str]):
        if state.get(n) == 2 or n in errors:
            return
        if state.get(n) == 1:
            cycle = stack[stack.index(n):] + [n]
            for c in cycle:
                errors.setdefault(c, "circular reference: " + " -> ".join(cycle))
            return
        state[n] = 1
        for d in sorted(deps.get(n, ())):
            if d not in exprs:
                errors.setdefault(n, f"unknown parameter {d!r}")
            else:
                visit(d, stack + [n])
        state[n] = 2
        if n in errors or any(d in errors for d in deps.get(n, ())):
            errors.setdefault(n, "depends on a parameter with an error")
            return
        try:
            values[n] = evaluate(exprs[n], values)
            order.append(n)
        except FormulaError as e:
            errors[n] = str(e)

    for name in exprs:
        if name in deps:
            visit(name, [])
    return {"values": values, "order": order, "errors": errors, "ok": not errors}


def resolve_template(template: Any, values: dict[str, float]) -> Any:
    """Deep-copies `template`, replacing every "=formula" string with its value."""
    if isinstance(template, dict):
        return {k: resolve_template(v, values) for k, v in template.items()}
    if isinstance(template, list):
        return [resolve_template(v, values) for v in template]
    if isinstance(template, str) and template.startswith("="):
        return evaluate(template[1:], values)
    return template


def parse_design_table(csv_text: str) -> list[dict[str, float]]:
    """CATIA Design Table from CSV (comma or semicolon separated, first row
    = parameter names, one configuration per following row)."""
    lines = [l for l in csv_text.replace("\r", "").split("\n") if l.strip()]
    if len(lines) < 2:
        raise FormulaError("a design table needs a header row and at least one configuration")
    sep = ";" if lines[0].count(";") > lines[0].count(",") else ","
    header = [h.strip() for h in lines[0].split(sep)]
    rows = []
    for i, line in enumerate(lines[1:], start=2):
        cells = [c.strip() for c in line.split(sep)]
        if len(cells) != len(header):
            raise FormulaError(f"design table row {i} has {len(cells)} cells, header has {len(header)}")
        row = {}
        for h, c in zip(header, cells):
            try:
                row[h] = evaluate(c)
            except FormulaError:
                row[h] = c  # a text column, e.g. a configuration name
        rows.append(row)
    return rows
