//! Transcendental float functions with the same results on every target.
//!
//! Rust's `f32::sin`, `f32::exp`, `f32::powf` and friends call the platform's
//! math library: glibc on Linux, libSystem on macOS, and compiler-builtins'
//! libm on wasm32. Those implementations are allowed to differ in the last
//! bit, and the simulation feeds each result back into the next tick, so the
//! differences grow until two platforms have different worlds.
//!
//! Every call in the simulation goes through these methods instead. They use
//! the pure-Rust `libm` crate with its assembly paths turned off, so the same
//! source gives the same bits on every target. `sqrt`, `floor`, `abs` and the
//! basic operators are IEEE-exact and stay as they are.

/// Deterministic transcendental functions for `f32` and `f64`.
pub trait DetMath: Copy {
    fn det_sin(self) -> Self;
    fn det_cos(self) -> Self;
    fn det_tan(self) -> Self;
    fn det_asin(self) -> Self;
    fn det_acos(self) -> Self;
    fn det_atan(self) -> Self;
    fn det_atan2(self, other: Self) -> Self;
    fn det_sinh(self) -> Self;
    fn det_cosh(self) -> Self;
    fn det_tanh(self) -> Self;
    fn det_exp(self) -> Self;
    fn det_exp2(self) -> Self;
    fn det_exp_m1(self) -> Self;
    fn det_ln(self) -> Self;
    fn det_ln_1p(self) -> Self;
    fn det_log(self, base: Self) -> Self;
    fn det_log2(self) -> Self;
    fn det_log10(self) -> Self;
    fn det_powf(self, exp: Self) -> Self;
    fn det_powi(self, exp: i32) -> Self;
    fn det_hypot(self, other: Self) -> Self;
    fn det_cbrt(self) -> Self;
}

impl DetMath for f32 {
    #[inline]
    fn det_sin(self) -> f32 {
        libm::sinf(self)
    }
    #[inline]
    fn det_cos(self) -> f32 {
        libm::cosf(self)
    }
    #[inline]
    fn det_tan(self) -> f32 {
        libm::tanf(self)
    }
    #[inline]
    fn det_asin(self) -> f32 {
        libm::asinf(self)
    }
    #[inline]
    fn det_acos(self) -> f32 {
        libm::acosf(self)
    }
    #[inline]
    fn det_atan(self) -> f32 {
        libm::atanf(self)
    }
    #[inline]
    fn det_atan2(self, other: f32) -> f32 {
        libm::atan2f(self, other)
    }
    #[inline]
    fn det_sinh(self) -> f32 {
        libm::sinhf(self)
    }
    #[inline]
    fn det_cosh(self) -> f32 {
        libm::coshf(self)
    }
    #[inline]
    fn det_tanh(self) -> f32 {
        libm::tanhf(self)
    }
    #[inline]
    fn det_exp(self) -> f32 {
        libm::expf(self)
    }
    #[inline]
    fn det_exp2(self) -> f32 {
        libm::exp2f(self)
    }
    #[inline]
    fn det_exp_m1(self) -> f32 {
        libm::expm1f(self)
    }
    #[inline]
    fn det_ln(self) -> f32 {
        libm::logf(self)
    }
    #[inline]
    fn det_ln_1p(self) -> f32 {
        libm::log1pf(self)
    }
    #[inline]
    fn det_log(self, base: f32) -> f32 {
        libm::logf(self) / libm::logf(base)
    }
    #[inline]
    fn det_log2(self) -> f32 {
        libm::log2f(self)
    }
    #[inline]
    fn det_log10(self) -> f32 {
        libm::log10f(self)
    }
    #[inline]
    fn det_powf(self, exp: f32) -> f32 {
        libm::powf(self, exp)
    }
    #[inline]
    fn det_powi(self, exp: i32) -> f32 {
        powi_by_squaring(self, exp)
    }
    #[inline]
    fn det_hypot(self, other: f32) -> f32 {
        libm::hypotf(self, other)
    }
    #[inline]
    fn det_cbrt(self) -> f32 {
        libm::cbrtf(self)
    }
}

impl DetMath for f64 {
    #[inline]
    fn det_sin(self) -> f64 {
        libm::sin(self)
    }
    #[inline]
    fn det_cos(self) -> f64 {
        libm::cos(self)
    }
    #[inline]
    fn det_tan(self) -> f64 {
        libm::tan(self)
    }
    #[inline]
    fn det_asin(self) -> f64 {
        libm::asin(self)
    }
    #[inline]
    fn det_acos(self) -> f64 {
        libm::acos(self)
    }
    #[inline]
    fn det_atan(self) -> f64 {
        libm::atan(self)
    }
    #[inline]
    fn det_atan2(self, other: f64) -> f64 {
        libm::atan2(self, other)
    }
    #[inline]
    fn det_sinh(self) -> f64 {
        libm::sinh(self)
    }
    #[inline]
    fn det_cosh(self) -> f64 {
        libm::cosh(self)
    }
    #[inline]
    fn det_tanh(self) -> f64 {
        libm::tanh(self)
    }
    #[inline]
    fn det_exp(self) -> f64 {
        libm::exp(self)
    }
    #[inline]
    fn det_exp2(self) -> f64 {
        libm::exp2(self)
    }
    #[inline]
    fn det_exp_m1(self) -> f64 {
        libm::expm1(self)
    }
    #[inline]
    fn det_ln(self) -> f64 {
        libm::log(self)
    }
    #[inline]
    fn det_ln_1p(self) -> f64 {
        libm::log1p(self)
    }
    #[inline]
    fn det_log(self, base: f64) -> f64 {
        libm::log(self) / libm::log(base)
    }
    #[inline]
    fn det_log2(self) -> f64 {
        libm::log2(self)
    }
    #[inline]
    fn det_log10(self) -> f64 {
        libm::log10(self)
    }
    #[inline]
    fn det_powf(self, exp: f64) -> f64 {
        libm::pow(self, exp)
    }
    #[inline]
    fn det_powi(self, exp: i32) -> f64 {
        powi_by_squaring(self, exp)
    }
    #[inline]
    fn det_hypot(self, other: f64) -> f64 {
        libm::hypot(self, other)
    }
    #[inline]
    fn det_cbrt(self) -> f64 {
        libm::cbrt(self)
    }
}

/// Integer power by repeated squaring, written out so it does not depend on
/// the compiler's `powi` intrinsic (which may expand differently per target
/// and optimisation level).
#[inline]
fn powi_by_squaring<T>(base: T, exp: i32) -> T
where
    T: Copy + std::ops::Mul<Output = T> + std::ops::Div<Output = T> + From<u8>,
{
    let mut n = exp.unsigned_abs();
    let mut a = base;
    let mut r = T::from(1u8);
    loop {
        if n & 1 == 1 {
            r = r * a;
        }
        n >>= 1;
        if n == 0 {
            break;
        }
        a = a * a;
    }
    if exp < 0 {
        T::from(1u8) / r
    } else {
        r
    }
}
