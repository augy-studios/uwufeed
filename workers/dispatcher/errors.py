"""Failures that should stop a target rather than be retried."""


class PermanentFailure(Exception):
    """The destination is gone, not busy.

    A blocked bot, a deleted webhook, a dead browser subscription. Retrying
    any of these forever costs requests and never succeeds, so the
    dispatcher deactivates the target instead.
    """
