"""Command registry. One module per command, each with register(client)."""

from . import add, latest, link, list, pause, remove, route, settings, start, status

MODULES = [start, add, list, remove, route, pause, latest, status, settings, link]


def register_all(client) -> None:
    for module in MODULES:
        module.register(client)
