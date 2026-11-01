import secrets

ID_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-"
ID_LENGTH = 21


def new_id() -> str:
    """Random 21-char id (126 bits) matching the schema's `Id` pattern [A-Za-z0-9_-]{1,64}."""
    return "".join(secrets.choice(ID_ALPHABET) for _ in range(ID_LENGTH))
