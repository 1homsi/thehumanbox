pub fn prefix_chars(s: &str, n: usize) -> &str {
    match s.char_indices().nth(n) {
        Some((byte, _)) => &s[..byte],
        None => s,
    }
}

#[cfg(test)]
mod tests {
    use super::prefix_chars;

    #[test]
    fn prefix_chars_never_splits_a_character() {
        assert_eq!(prefix_chars("abcdefgh", 4), "abcd");
        assert_eq!(prefix_chars("abc", 4), "abc");
        assert_eq!(prefix_chars("", 4), "");
        assert_eq!(prefix_chars("a\u{e9}\u{e9}", 4), "a\u{e9}\u{e9}");
        assert_eq!(prefix_chars("a\u{e9}\u{e9}xyz", 4), "a\u{e9}\u{e9}x");
        assert_eq!(
            prefix_chars("\u{65e5}\u{672c}\u{8a9e}\u{306e}\u{7dcf}", 2),
            "\u{65e5}\u{672c}"
        );
    }
}
