# Naught

> *Everything decays, even your software.*

Naught is a software supply chain observer that show you how decay your software systems.

## The problem

Software is not a static object. A running system is assembled from thousands of dependencies: 
packages, libraries, base images, configuration, certificates, credentials... 
Together they do the job, but each one is decaying, and they do not decay at the same speed:

- Certificates expire on 90 days. It is *Predictable.*
- Vulnerabilities arrive from nowhere. It is *Sudden.*
- Vendor libraries get abandoned. It is *Silent.*
- Configuration drifts. It is *Gradual.*

People points on a system and says "It works", but that says nothing about the health of a system. 
And because the whole is emergent, so is its collapse as a system when one thing went wrong.

An example: In 2016, eleven lines of JavaScript named `left-pad` were removed from `npm`, and builds broke around the world. 
But exceptionally, If your DevOps teams didn't set nightly builds, you won't see that coming.

## What Naught does

Naught is a read-only observer. It records what your systems are assembled from, and measures *drifts*: 
the distance between your source of truth and the current state that Naught is checking.

Naught measures *drifts* along several *axes*:

| Axis          | Declared state                                  | Observed state                                 | Drift indicates                                           | Status    |
|---------------|-------------------------------------------------|------------------------------------------------|-----------------------------------------------------------|-----------|
| Dependencies  | The package versions that your lock file pins   | What advisory sources report about them now    | Vulnerable, compromised, or abandoned packages            | Available |
| Base images   | The digest that a tag resolved to at build time | The digest that the same tag resolves to now   | The tag now points to a different image                   | Available |
| Placement     | The scheduling plan                             | The nodes where workloads run                  | Workloads running outside their planned placement         | Planned   |
| Configuration | The node state declared in your repository      | The current node state                         | Nodes whose configuration differs from the declared state | Planned   |
| Credentials   | The intended lifetime of a credential           | The time since the credential was last rotated | Credentials in use past their intended lifetime           | Planned   |

Drift values are comparable within an axis, but not across axes. Together, the values from all of them form a *drift vector*.

> [!NOTE]
> A drift value of `null` means that Naught observed the subject but could not compute a value. It does not mean that the drift is zero.

Naught raises a warning when a drift value crosses a threshold you set, or when new things appear but was not present in the previous run.

### Use cases

Naught answers questions such as:

- Which components does this system have right now?
- An upstream package or image changed. Which of your systems depend on it, directly or transitively?
- What changed in your systems, and when?
- Which components have degraded since the last review?

## What Naught not do

- **Remediate.** It does not patch, upgrade, restart, or roll back your system. You have to take actions on your own.
- **Mutate your system.** It only needs read-only roles & credentials.
- **Become a dependency.** Just Docker, or a k8s-like system, which is a basic on any IT system.
- **Storing data in unprocessable formats.** Everything Naught retains is plain files on disk.
- **Vendor-locked you:** You can remove Naught and everything keeps running as before.


## Principles

- **Inert.** Its own state is append-only files. Collectors write but no rewrites. 
Every database, index, and view is derived, and can be thrown away and rebuilt.

- **Compact.** Each collector is a thin, replaceable adapter small enough to read in one sitting. 
The data format of Naught is the durable contract, but you can expect its code is disposable.

- **Transparent.** Every conclusion shows where it came from.

- **Independent.** Naught stands on its own. It can be fed by a sibling tools if you have, but not requires any of them.

- **Zero hostage.** Remove it, and nothing of yours is lost.

- **Honest about blind spots.** What Naught cannot see is marked as `unknown`.

- **No verdict without coverage.** Every answer arrives with how much Naught actually look at.

## License

AGPL-3.0. See `LICENSE`.

