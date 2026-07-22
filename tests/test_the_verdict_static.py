from pathlib import Path


CONTRACT = Path(__file__).resolve().parents[1] / "contracts" / "the_verdict.py"
SOURCE = CONTRACT.read_text(encoding="utf-8")


def test_contract_has_centralized_rule_constants_before_storage_classes():
    constants = [
        "MIN_ARGUMENT_LENGTH = 50",
        "MAX_ARGUMENT_LENGTH = 800",
        "MIN_TOPIC_LENGTH = 20",
        "MAX_TOPIC_LENGTH = 180",
        "MAX_CATEGORY_LENGTH = 48",
        "JOIN_DEADLINE_SECONDS = 86400",
        "SUBMIT_DEADLINE_SECONDS = 172800",
        "MIN_STAKE = 0",
    ]
    first_storage = SOURCE.index("@gl.storage")
    for constant in constants:
        assert constant in SOURCE
        assert SOURCE.index(constant) < first_storage


def test_duel_does_not_store_mutable_source_urls():
    assert "data_sources_used" not in SOURCE
    assert "source_url" not in SOURCE


def test_permissionless_judge_duel_checks_active_and_arguments():
    method_start = SOURCE.index("def judge_duel")
    method_end = SOURCE.index("    @gl.public.write\n    def expire_duel")
    method = SOURCE[method_start:method_end]

    assert 'assert duel.status == "active"' in method
    assert 'assert duel.left_argument != ""' in method
    assert 'assert duel.right_argument != ""' in method
    assert "gl.message.sender_address ==" not in method


def test_argument_and_topic_bounds_are_enforced_on_chain():
    assert "assert len(topic) >= MIN_TOPIC_LENGTH" in SOURCE
    assert "assert len(topic) <= MAX_TOPIC_LENGTH" in SOURCE
    assert "assert len(category) <= MAX_CATEGORY_LENGTH" in SOURCE
    assert "assert len(argument) >= MIN_ARGUMENT_LENGTH" in SOURCE
    assert "assert len(argument) <= MAX_ARGUMENT_LENGTH" in SOURCE


def test_deadlines_are_passed_as_create_duel_parameters():
    signature = (
        "def create_duel(self, topic: str, category: str, "
        "join_deadline: u256, submit_deadline: u256)"
    )
    assert signature in SOURCE
    assert "submit_deadline > join_deadline" in SOURCE
