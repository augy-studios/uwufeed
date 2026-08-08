"""Command registry. One module per command, each with register(client)."""

from . import add, latest, link, list, pause, remove, settings, start, status

MODULES = [start, add, list, remove, pause, latest, status, settings, link]


def register_all(client) -> None:
    for module in MODULES:
        module.register(client)
