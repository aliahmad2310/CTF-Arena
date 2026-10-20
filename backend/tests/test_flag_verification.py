import pytest
from app.core.security import compute_flag_hash, verify_flag


def test_flag_hash_computation():
    flag = "CTF{unit_test_flag_1234}"
    salt = "test_salt_alpha"
    hash1 = compute_flag_hash(flag, salt)
    hash2 = compute_flag_hash(flag, salt)
    assert hash1 == hash2
    assert len(hash1) == 64  # SHA-256 output length in hex


def test_flag_verification_correct():
    flag = "CTF{precision_flag_verification}"
    salt = "salt_beta_789"
    target_hash = compute_flag_hash(flag, salt)

    # Exact match succeeds
    assert verify_flag(flag, salt, target_hash) is True

    # Leading/trailing whitespace should be stripped safely
    assert verify_flag(f"  {flag}  \n", salt, target_hash) is True


def test_flag_verification_wrong():
    flag = "CTF{correct_flag_target}"
    salt = "salt_gamma"
    target_hash = compute_flag_hash(flag, salt)

    # Incorrect flag string rejected
    assert verify_flag("CTF{wrong_flag_guess}", salt, target_hash) is False
    assert verify_flag("CTF{correct_flag_target}_extra", salt, target_hash) is False
    assert verify_flag("", salt, target_hash) is False


def test_case_sensitivity():
    flag_upper = "CTF{CaSe_SenSiTive_TeST}"
    salt = "salt_delta"

    # Case sensitive mode
    target_hash_strict = compute_flag_hash(flag_upper, salt, is_case_sensitive=True)
    assert verify_flag(flag_upper.lower(), salt, target_hash_strict, is_case_sensitive=True) is False
    assert verify_flag(flag_upper, salt, target_hash_strict, is_case_sensitive=True) is True

    # Case insensitive mode
    target_hash_loose = compute_flag_hash(flag_upper, salt, is_case_sensitive=False)
    assert verify_flag(flag_upper.lower(), salt, target_hash_loose, is_case_sensitive=False) is True
    assert verify_flag(flag_upper.upper(), salt, target_hash_loose, is_case_sensitive=False) is True
