"""One answer to "must this account prove its email address?".

The rule used to be spelled ``get_deployment_mode() == 'saas'`` inline at every
gate — signup, login, magic link, email change. That is exactly how a
self-hosted install ended up auto-verifying every address at signup (and
therefore refusing nothing at login): one site decided "verification applies",
another decided "assume it is verified", and nothing said so.

:func:`email_verification_required` is now the only place the rule lives. SaaS
always requires it. A self-hosted operator opts in with
``LEARNHOUSE_EMAIL_VERIFICATION=true`` so the school can refuse addresses it
cannot prove (typos, rivals' signups). It stays opt-in because requiring
verification without a working mailer locks everyone out; see
``email_verification`` in ``config/config.yaml``.

The deployment mode is a parameter rather than looked up here so that the
calling module's own ``get_deployment_mode`` reference stays the one that runs —
tests patch that name per module, and reading it from here would silently make
those patches inert.
"""

import logging
from typing import Literal, Optional

from config.config import get_learnhouse_config

logger = logging.getLogger(__name__)

DeploymentMode = Literal['saas', 'ee', 'oss']


def email_verification_required(mode: Optional[DeploymentMode] = None) -> bool:
    """Whether an email+password signup must verify before it can sign in.

    Args:
        mode: The caller's resolved deployment mode. Pass it when the caller
            already imports ``get_deployment_mode``; omit it to resolve it here.

    Callers must not re-derive this from the deployment mode on their own; that
    reintroduces the split this module exists to remove.
    """
    if mode is None:
        from src.core.deployment_mode import get_deployment_mode

        mode = get_deployment_mode()

    if mode == 'saas':
        return True
    return bool(get_learnhouse_config().general_config.email_verification)