"""Text-tokenization loaders.

Hosts the spaCy and Stanza tokenizer loaders behind the :class:`ITokenizer`
port. The loaders identify the language with py3langid (unless the caller
overrides it), route no-whitespace scripts to Stanza and everything else to a
per-language spaCy blank pipeline, and emit tokens with UTF-8 byte offsets and
UTF-16 code-unit offsets.
"""
