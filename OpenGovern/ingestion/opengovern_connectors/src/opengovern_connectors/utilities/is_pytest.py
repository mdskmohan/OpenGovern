import sys

from opengovern_connectors.configuration.env_vars import get_test_mode


def is_pytest_running() -> bool:
    return "pytest" in sys.modules and get_test_mode() == "1"
